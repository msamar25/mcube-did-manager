"""Run with: python -m unittest discover -s tests -v"""
import json, unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.workflows import Workflows, REQUEST_HEADERS

class FakeCore:
    def __init__(self):self.data={};self.fail=False
    def get_rows(self,name,headers):return [dict(zip(headers,r)) for r in self.data.get(name,[])]
    def replace_rows(self,name,headers,rows):
        if self.fail:raise RuntimeError('simulated sheet failure')
        self.data[name]=[list(r) for r in rows]
    def worksheet(self,*args):return FakeWS(self,args[1])
    def sheet(self):return None
class FakeWS:
    def __init__(self,core,name):self.core=core;self.name=name
    def append_row(self,row,value_input_option='RAW'):self.core.data.setdefault(self.name,[]).append(list(row))
class RecoveryTests(unittest.TestCase):
    def test_failure_then_replay(self):
        core=FakeCore(); w=Workflows(core)
        req=dict.fromkeys(REQUEST_HEADERS,'');req.update(request_id='abc',status='pending')
        core.fail=True
        with self.assertRaises(RuntimeError):w.update_request(req)
        self.assertEqual(len(core.data['Request_Mutations']),1)
        core.fail=False
        self.assertEqual(w.recover_requests()['repaired'],1)
        self.assertEqual(w.requests()[0]['status'],'pending')
        self.assertEqual(w.recover_requests()['repaired'],0)
    def test_latest_mutation_wins(self):
        core=FakeCore();w=Workflows(core)
        req=dict.fromkeys(REQUEST_HEADERS,'');req.update(request_id='abc',status='pending')
        w.update_request(req)
        req['status']='approved';w.update_request(req)
        core.data['Pending_Requests']=[]
        self.assertEqual(w.recover_requests()['repaired'],1)
        self.assertEqual(w.requests()[0]['status'],'approved')
    def test_corrupted_ledger_fails_closed(self):
        core=FakeCore();w=Workflows(core)
        core.data['Request_Mutations']=[['id','now','abc','invalid-json']]
        with self.assertRaises(RuntimeError):w.recover_requests()
if __name__=='__main__':unittest.main()
