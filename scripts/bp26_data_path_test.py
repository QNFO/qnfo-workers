import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from bp26_web import availability_response
from bp26_producers import Resp

class Ctx:
    def __init__(self,response): self.response=response;self.calls=[]
    def http(self,url): self.calls.append(url);return self.response

shell=Resp(200,{},[],"shell","https://fleet.qnfo.org/",1,[],None)
for status,ms,error in [(503,10,None),(200,6000,None),(200,20,None),(0,0,'budget-exhausted')]:
    response=Resp(status,{},[],"data","https://fleet.qnfo.org/api/v3/now",ms,[],error)
    ctx=Ctx(response)
    actual=availability_response(ctx,'fleet.qnfo.org',{'fleet.qnfo.org':shell})
    assert actual is response
    assert ctx.calls==['https://fleet.qnfo.org/api/v3/now']
    assert actual.ms==ms and actual.error==error
ctx=Ctx(None)
assert availability_response(ctx,'q08.org',{'q08.org':shell}) is shell
assert ctx.calls==[]
print('PASS fleet availability samples the data API including failure, slow latency and unsampled budget state; other hosts retain existing samples')
