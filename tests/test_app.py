import itertools
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from app import Handler
from recommender import ACTIVITIES, INVESTMENTS, RISKS, SCALES, recommend

BASE = {"activity": "services", "scale": "small", "founders": 1, "investment": "none", "risk": "personal"}
open_local = build_opener(ProxyHandler({})).open


class RecommendationTests(unittest.TestCase):
    def test_independent_small_business(self):
        self.assertEqual(recommend(BASE)["key"], "ip")

    def test_partners_and_limited_risk(self):
        self.assertEqual(recommend({**BASE, "founders": 2, "risk": "limited", "investment": "partners"})["key"], "ooo")

    def test_single_founder_can_choose_limited_risk(self):
        self.assertEqual(recommend({**BASE, "risk": "limited"})["key"], "ooo")

    def test_fifty_is_allowed_for_ooo(self):
        self.assertEqual(recommend({**BASE, "founders": 50, "investment": "partners"})["key"], "ooo")

    def test_over_fifty_needs_ao(self):
        self.assertEqual(recommend({**BASE, "founders": 51})["key"], "ao")

    def test_public_investment(self):
        result = recommend({**BASE, "investment": "public"})
        self.assertEqual(result["key"], "pao")
        self.assertEqual(result["capital"], "от 100 000 ₽")

    def test_invalid_input(self):
        for data in (None, [], {}, {**BASE, "founders": True}, {**BASE, "founders": 1.5}, {**BASE, "founders": 0}, {**BASE, "founders": 10001}, {**BASE, "risk": []}, {**BASE, "activity": "unknown"}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                recommend(data)

    def test_constraints_across_all_profiles(self):
        for activity, scale, count, investment, risk in itertools.product(ACTIVITIES, SCALES, [1, 2, 50, 51, 10000], INVESTMENTS, RISKS):
            data = dict(activity=activity, scale=scale, founders=count, investment=investment, risk=risk)
            result = recommend(data)
            with self.subTest(data=data):
                self.assertTrue(result["reasons"])
                if count > 1 or risk == "limited" or investment != "none":
                    self.assertNotEqual(result["key"], "ip")
                if count > 50:
                    self.assertNotEqual(result["key"], "ooo")
                if investment == "public":
                    self.assertEqual(result["key"], "pao")
                self.assertEqual(len(result["alternatives"]), 3)


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_static_files(self):
        for path in ("/", "/styles.css", "/app.js", "/favicon.svg", "/api/health"):
            with self.subTest(path=path), open_local(self.url + path, timeout=5) as response:
                self.assertEqual(response.status, 200)
                self.assertTrue(response.read())
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_recommendation_endpoint(self):
        request = Request(self.url + "/api/recommend", data=json.dumps(BASE).encode(), headers={"Content-Type": "application/json"})
        with open_local(request, timeout=5) as response:
            self.assertEqual(json.load(response)["key"], "ip")

    def test_bad_json_and_invalid_values(self):
        for payload in (b"not json", b"[]", b"{}", json.dumps({**BASE, "founders": -1}).encode()):
            with self.subTest(payload=payload):
                with self.assertRaises(HTTPError) as context:
                    open_local(Request(self.url + "/api/recommend", data=payload), timeout=5)
                self.assertEqual(context.exception.code, 400)
                self.assertIn("error", json.load(context.exception))
                context.exception.close()

    def test_no_arbitrary_file_access(self):
        with self.assertRaises(HTTPError) as context:
            open_local(self.url + "/../recommender.py", timeout=5)
        self.assertEqual(context.exception.code, 404)
        context.exception.close()


if __name__ == "__main__":
    unittest.main()
