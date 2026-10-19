import unittest
from backend.workflows import Workflows

class MatchingTests(unittest.TestCase):
 def setUp(self):self.w=Workflows(None)
 def test_phone_normalization(self):
  self.assertEqual(self.w.phone('+91-9986651141'),'9986651141')
  self.assertEqual(self.w.phone('9986651141'),'9986651141')
  self.assertEqual(self.w.phone('123'),'')
  self.assertEqual(self.w.phone('999999999999999999'),'')
 def test_timezone(self):
  self.assertEqual(self.w.call_time('2026-10-19 12:31:22'),'2026-10-19T07:01:22+00:00')
  self.assertEqual(self.w.call_time('bad'),'')

if __name__=='__main__':unittest.main()
