'use strict';

class WSMiner {
    constructor(host, port, user, pass, threads, proxy, jshost = "") {
        this.host = host;
        this.port = port;
        this.user = user;
        this.pass = pass;
        this.threads = threads;
        this.workers = [];
        this.ws = null;
        this.jshost = jshost;
        this.proxy = proxy;
    }
    start() {
        var auth = false;
        this.ws = new WebSocket(this.proxy);
        this.ws.onopen = (ev) => {
            console.log('open');
            var msg = { "id": 0, "method": "proxy.connect", "params": [] };
            msg.params[0] = this.host;
            msg.params[1] = this.port;
            this.ws.send(JSON.stringify(msg) + "\n");
            auth = false;
            msg = { "id": 1, "method": "mining.subscribe", "params": [] };
            var user_agent = 'webminer/0.1';
            var session_id = null;
            msg.params[0] = user_agent;
            if (session_id) {
                msg.params[1] = session_id;
            }
            this.ws.send(JSON.stringify(msg) + "\n");
        }; //onopen
        this.ws.onclose = function(ev) {
            console.log('close');
        };
        var work = {};
        this.ws.onmessage = function(ev) {
            console.log('message: ' + ev.data);
            var doauth = false;
            var json = JSON.parse(ev.data);
            var result = json.result;
            if (result) {
                var res0 = result[0];
                if (json.id == 1) {
                    // for bunnymining.work
                    var res00 = res0[0];
                    if (res00 == 'mining.notify') {
                        var sessionid = res0[1];
                        var xnonce1 = result[1];
                        var xnonce2len = result[2];
                        work['sessionid'] = sessionid;
                        work['xnonce1'] = xnonce1;
                        work['xnonce2len'] = xnonce2len;
                        console.log('mining.mining.notify 1: ' + work);
                        doauth = true;
                    }
                    // for jp.lapool.me
                    var res000 = res00[0];
                    if (res000 == 'mining.set_difficulty') {
                        var xnonce1 = result[1];
                        var xnonce2len = result[2];
                        work['xnonce1'] = xnonce1;
                        work['xnonce2len'] = xnonce2len;
                        console.log('mining.mining.notify 1: ' + work);
                        doauth = true;
                    }
                }
            }
            if (json.id == 4 && !json.method) {
                if (json.result) {
                    //var yc = parseInt($('#yaycount').text());
                    yc++;
                } else {
                    //var bc = parseInt($('#boocount').text());
                    bc++;
                }
            }
            var method = json.method;
            var params = json.params;
            if (json.id == null) {
                if (method == 'mining.set_difficulty') {
                    var diff = params[0];
                    console.log('mining.set_difficulty: ' + diff);
                    work['diff'] = diff;
                } else if (method == 'mining.notify') {
                    work['jobid'] = params[0];
                    work['prevhash'] = params[1];
                    work['coinb1'] = params[2];
                    work['coinb2'] = params[3];
                    work['merkles'] = params[4];
                    work['version'] = params[5];
                    work['nbits'] = params[6];
                    work['ntime'] = params[7];
                    work['clean'] = params[8];
                    console.log('mining.notify 2: ' + work);
                    for (var i = 0; i < this.threads; i++) {
                        var worker = workers[i];
                        if (worker) {
                            worker.terminate();
                        }
                        worker = new Worker(this.jshost + '/js/worker_all.js');
                        workers[i] = worker;
                        worker.onmessage = function(e) {
                            var result = e.data;
                            console.log('recv from worker: ' + result);
                            var xnonce2 = result[0];
                            var nonce = result[1];
                            var username = this.user;
                            var msg = {
                                "id": 4,
                                "method": "mining.submit",
                                "params": [username, work.jobid, xnonce2, work.ntime, nonce]
                            };
                            this.ws.send(JSON.stringify(msg) + "\n");
                            work['nonce'] = parseInt(nonce, 16) + 1;
                            console.log('restart nonce', work['nonce']);
                            worker.postMessage($.extend({}, work));
                        }
                    }
                    setTimeout(function() {
                        for (var i = 0; i < this.threads; i++) {
                            work['nonce'] = 0x10000000 * i;
                            console.log('start nonce', work['nonce']);
                            worker.postMessage($.extend({}, work));
                        }
                    }, 1000); // TODO wait for main of foo.c
                }
            }
            if (!auth && doauth) {
                auth = true;
                msg = { "id": 2, "method": "mining.authorize", "params": [] };
                msg.params[0] = $('#username').val();
                msg.params[1] = $('#password').val();
                this.ws.send(JSON.stringify(msg) + "\n");
            }
        };
        this.ws.onerror = (ev) => {
            console.log('error');
            for (var i = 0; i < workers.length; i++) {
                var worker = workers[i];
                if (worker) {
                    worker.postMessage('stop');
                    workers[i] = null;
                }
            }
        };
        return false;
    }
}
