const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
    const nodes = new Map(), scripts = [], timers = new Map(), reports = [];
    let timerId = 0, tokenReads = 0;
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, {textContent:'', innerHTML:'', hidden:false, replaceChildren(){this.textContent='';this.innerHTML='';}});
        return nodes.get(id);
    };
    const ctx = {
        sessionEpoch:0, currentUser:{role:'mhs'}, token:'student-session',
        getSessionToken(){
            if (++tokenReads > 32) throw Error('Recursive placeholder call');
            return ctx.token;
        },
        uxText:(_id,en)=>en, escapeHtml:value=>String(value),
        setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},
        clearTimeout:id=>timers.delete(id),
        document:{
            getElementById:node,
            addEventListener(){},
            createElement(){return {removed:false,remove(){this.removed=true;}};},
            head:{append(script){scripts.push(script);}}
        },
        window:{addEventListener(){},IPCOSNext:{report:(...args)=>reports.push(args)}}
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../lazy-modules.js'),'utf8'),ctx);
    return {ctx,node,scripts,timers,reports,tokenReads:()=>tokenReads};
}

function implementation() {
    const calls = {received:[],opened:[],resets:0};
    return {calls,module:{
        receive:contents=>calls.received.push(contents),
        open:(...args)=>calls.opened.push(args),
        reset:()=>calls.resets++
    }};
}

test('HTTP 200 without a SOP implementation ends loading and offers a fresh retry', async () => {
    const f=fixture(), placeholder=f.ctx.window.IPCOSSop;
    placeholder.receive([{Tipe:'sop_magang',DataJSON:'fixture'}]);
    const first=placeholder.open('sop_magang');
    assert.equal(f.scripts.length,1);
    f.scripts[0].onload(); // Empty or syntactically invalid JavaScript can fire onload.
    await first;
    assert.match(f.node('sop_magang-view').innerHTML,/role="status"/);
    assert.match(f.node('sop_magang-view').innerHTML,/data-load-sop="sop_magang"/);
    assert.equal(f.scripts[0].removed,true);
    assert.equal(f.timers.size,0);
    assert.equal(f.reports.length,1);
    assert(f.tokenReads() < 3, 'The placeholder must not recursively reopen itself');

    const retried=placeholder.open('sop_magang',true), installed=implementation();
    assert.equal(f.scripts.length,2);
    f.ctx.window.IPCOSSop=installed.module;
    f.scripts[1].onload();
    await retried;
    assert.equal(installed.calls.received[0][0].DataJSON,'fixture');
    assert.deepEqual(installed.calls.opened,[['sop_magang',true]]);
    assert.equal(f.scripts[1].removed,false);
    assert.equal(f.timers.size,0);
});

test('Concurrent missing-implementation opens share one attempt and one retry script', async () => {
    const f=fixture(), placeholder=f.ctx.window.IPCOSSop;
    const a=placeholder.open('sop_magang'),b=placeholder.open('sop_tugas_akhir');
    assert.equal(f.scripts.length,1);
    f.scripts[0].onload();
    await Promise.all([a,b]);
    for(const type of ['sop_magang','sop_tugas_akhir'])
        assert.match(f.node(type+'-view').innerHTML,/data-load-sop=/);
    const c=placeholder.open('sop_magang'),d=placeholder.open('sop_tugas_akhir');
    assert.equal(f.scripts.length,2);
    const installed=implementation();f.ctx.window.IPCOSSop=installed.module;
    f.scripts[1].onload();await Promise.all([c,d]);
    assert.equal(installed.calls.opened.length,2);
    assert.equal(f.scripts.filter(script=>!script.removed).length,1);
});

test('An old SOP load still resets its module without rendering after a session change', async () => {
    const f=fixture(), placeholder=f.ctx.window.IPCOSSop;
    placeholder.receive([{Tipe:'sop_magang',DataJSON:'private-old-session'}]);
    const loading=placeholder.open('sop_magang');
    f.ctx.sessionEpoch++;f.ctx.token='';placeholder.reset();
    const installed=implementation();f.ctx.window.IPCOSSop=installed.module;
    f.scripts[0].onload();await loading;
    assert.equal(installed.calls.resets,1);
    assert.equal(installed.calls.received.length,0);
    assert.equal(installed.calls.opened.length,0);
    assert.equal(f.node('sop_magang-view').textContent,'');
    assert.equal(f.node('sop_magang-view').innerHTML,'');
});

test('A failed module attempt cannot display an error in a replacement session', async () => {
    const f=fixture(), placeholder=f.ctx.window.IPCOSSop;
    const loading=placeholder.open('sop_magang');
    f.ctx.sessionEpoch++;placeholder.reset();
    f.scripts[0].onload();await loading;
    assert.equal(f.node('sop_magang-view').innerHTML,'');
    assert.equal(f.scripts[0].removed,true);
    assert.equal(f.timers.size,0);
});
