#!/usr/bin/node
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
if (isMainThread) {
    let
        ha = {
            fetch: function (client, retry) {
                let sendDelay = 0, completed = 0, delay = 20, haSystem, buf = [];
                if (retry == undefined) retry = 0;
                if (client.ha) {
                    //   console.log(client.ha);
                    //  logs.haInputs.forEach(element => { console.log(element); });
                    for (let x = 0; x < client.ha.length; x++) {
                        for (let y = 0; y < cfg.homeAssistant.length; y++) {
                            haSystem = y;
                            for (let z = 0; z < logs.haInputs[y].length; z++) {
                                if (x == client.ha.length - 1 && z == logs.haInputs[y].length - 1) checkIfCompleted(x);
                                if (logs.haInputs[y][z] == client.ha[x]) {
                                    log("HA fetch found device for Client: " + a.color("white", client.name) + " On HA System: " + y + " - Entity: " + logs.haInputs[y][z], 1, 0)
                                    getData(y, client.ha[x]);
                                }
                            }
                        }
                    }       // flow is different than regular because NaN will corrupt flow meter NV data and also we want to know if a regular sensor is NaN
                    function getData(ha, name) {
                        let typeCheck = ["input_boolean", 'input_button', "switch", "input_number", "flow", "sensor"];
                        let typeGet = ["input_boolean", 'input_button', "switch", "input_number", "sensor", "sensor"];
                        for (let x = 0; x < typeCheck.length; x++) {
                            if (name.includes(typeCheck[x])) {
                                setTimeout(() => {
                                    hass[ha].states.get(typeGet[x], name)
                                        .then(data => {
                                            switch (x) {
                                                case 0:
                                                case 1:
                                                case 2: data.state == "on" ? buf.push(true) : buf.push(false); finished(); break;
                                                case 3:
                                                case 4: if (isNaN(Number(data.state)) != true && Number(data.state) != null)
                                                    buf.push(Number(data.state));  // prevent NaN for flow meters
                                                    finished();
                                                    break;
                                                case 5: buf.push(Number(data.state)); finished(); break;
                                            }
                                        })
                                        .catch(err => console.error(err))
                                }, sendDelay);
                                sendDelay += delay;
                                break;
                            }
                        }
                    }
                }
                function finished() {
                    completed++;
                    if (client.ha.length == completed) {
                        log("fetch completed, found " + completed + " entities, sending results for HA system:" + haSystem + " to client:" + client.name, 1)
                        udp.send(JSON.stringify({ type: "haFetchReply", obj: buf }), client.port)
                    }
                }
                function checkIfCompleted(x) {
                    setTimeout(() => {
                        if (completed != client.ha.length) {
                            if (retry < 3) {
                                log("Home Assistant is not fully online or some entities are not found, refreshing entities", 1, 2);
                                retry++;
                                for (let y = 0; y < cfg.homeAssistant.length; y++) {
                                    logs.haInputs[x] = [];
                                    hass[x].states.list()
                                        .then(data => {
                                            data.forEach(element => { logs.haInputs[x].push(element.entity_id) });
                                            if (cfg.homeAssistant.length - 1 == x) response.send(logs.haInputs);
                                        })
                                        .catch(err => { log("entity query failed: " + err, 1, 2); });
                                }
                                // setTimeout(() => { ha.fetch(client, retry) }, 20e3);  // client will reinitiate fetch call 
                            } else {
                                log("Home Assistant is not fully online or some entities are not found, all attempts failed, ", 1, 3);
                            }
                        }
                    }, 2e3);
                }
            },
            ws: function () {
                for (let haNum = 0; haNum < cfg.homeAssistant.length; haNum++) {
                    ws.push({});
                    let client = state.ha[haNum].ws;
                    let config = cfg.homeAssistant[haNum];
                    ws[haNum].connect("ws://" + config.address + ":" + config.port + "/api/websocket");
                    ws[haNum].on('connectFailed', function (error) { if (!client.error) { log(error.toString(), 1, 3); client.error = true; } });
                    ws[haNum].on('connect', function (socket) {
                        //    if (client.reply == false) { log("fetching sensor states", 1); ha.fetch(); client.id = 0; }
                        client.reply = true;
                        client.online = true;
                        client.error = false;
                        socket.on('error', function (error) {
                            if (!client.error) { log("websocket (" + a.color("white", config.address) + ") " + error.toString(), 1, 3); client.error = true; }
                        });
                        //   socket.on('close', function () { log('Connection closed!', 1, 3); });
                        socket.on('message', function (message) {
                            let buf = JSON.parse(message.utf8Data);
                            switch (buf.type) {
                                case "pong":
                                    //    log("pong: " + JSON.stringify(buf))
                                    client.reply = true;
                                    client.online = true;
                                    client.pingsLost = 0;
                                    let timeFinish = new Date().getMilliseconds();
                                    let timeResult = timeFinish - client.timeStart;
                                    if (timeResult > 500) log("websocket (" + a.color("white", config.address) + ") ping is lagging - delay is: " + timeResult + "ms", 1, 2);
                                    break;
                                case "auth_required":
                                    log("Websocket (" + a.color("white", config.address) + ") authenticating", 1);
                                    send({ type: "auth", access_token: config.token, });
                                    break;
                                case "auth_ok":
                                    //  state.udp = []; // force UDP client to reconnect if WS gets disconnected (will force fetch again)
                                    for (let x = 0; x < state.udp.length; x++) {
                                        udp.send(JSON.stringify({ type: "haFetchAgain" }), state.udp[x].port);
                                    }
                                    log("Websocket (" + a.color("white", config.address) + ") authentication accepted", 1);
                                    log("Websocket (" + a.color("white", config.address) + ") subscribing to event listener", 1);
                                    send({ id: 1, type: "subscribe_events", event_type: "state_changed" });
                                    client.timeStart = new Date().getMilliseconds();
                                    send({ id: client.id++, type: "ping" });
                                    setTimeout(() => { client.pingsLost = 0; send({ id: client.id++, type: "ping" }); client.reply = true; ping(); }, 10e3);
                                    break;
                                case "result": // sudo callback for set state via ws
                                    //  if (buf.id == tt2) log("ws result delay was: " + (Date.now() - tt))
                                    // log("result: " + JSON.stringify(buf));
                                    // 
                                    //  let delay = ha.perf(0);
                                    //     log("ws delay was: " + delay, 0, 0)
                                    break;
                                case "event":
                                    switch (buf.event.event_type) {
                                        case "state_changed":
                                            if (config.legacyAPI == false && state.perf.ha[haNum].wait == true) {
                                                let delay = ha.perf(0);
                                                log("ws delay was: " + delay, 0, 0)
                                            }
                                            let ibuf = undefined;
                                            if (buf.event.data.new_state != undefined                       // filter out corrupted events
                                                && buf.event.data.new_state != null) ibuf = buf.event.data.new_state.state;
                                            let obuf = undefined;
                                            if (logs.ws[haNum][client.logStep] == undefined) logs.ws[haNum].push(buf.event);
                                            else logs.ws[haNum][client.logStep] = buf.event                     // record last 200 ws events for this client into the ws log  
                                            if (client.logStep < 200) client.logStep++; else client.logStep = 0;
                                            //  log("WS received data" + JSON.stringify(buf.event))
                                            for (let x = 0; x < state.udp.length; x++) {                    // scan all UDP clients
                                                for (let y = 0; y < state.udp[x].ha.length; y++) {          // scan registered HA entities for each client 
                                                    if (state.udp[x].ha[y] == buf.event.data.entity_id) {   // if this entity ID matches Client X's Entity Y
                                                        //     log("WS received data for sensor: " + x + " local name: " + state.udp[x].ha[y] + " buf name: " + buf.event.data.entity_id + JSON.stringify(buf.event.data.new_state))
                                                        if (ibuf === "on") obuf = true;                     // check if entity is binary
                                                        else if (ibuf === "off") obuf = false;
                                                        else if (ibuf === null || ibuf == undefined) log("HA (" + a.color("white", config.address) + ") is sending bogus (null/undefined) data: " + ibuf, 1, 2);
                                                        else if (ibuf === "unavailable") {                  // only disconnected ESP modules send this code
                                                            if (cfg.telegram.logESPDisconnect == true)           // its annoying, see if enabled 
                                                                log("HA (" + a.color("white", config.address) + "): ESP Module has gone offline: " + buf.event.data.new_state.entity_id + ibuf, 1, 2);
                                                        }
                                                        else if (!isNaN(parseFloat(Number(ibuf))) == true   // check if data is float
                                                            && isFinite(Number(ibuf)) == true && Number(ibuf) != null) obuf = ibuf;
                                                        else if (ibuf.length == 32) { obuf = ibuf }         // button entity, its always 32 chars
                                                        else log("HA (" + a.color("white", config.address) + ") is sending bogus data = Entity: "
                                                            + buf.event.data.new_state.entity_id + " Bytes: " + ibuf.length + " data: " + ibuf, 1, 2);
                                                        //   log("ws sensor: " + x + " data: " + buf.event.data.new_state.state + " result: " + ibuf);
                                                        if (obuf != undefined) {                            // send data to relevant clients 
                                                            udp.send(JSON.stringify({ type: "haStateUpdate", obj: { id: y, state: obuf } }), state.udp[x].port);
                                                        }
                                                    }
                                                }
                                            }
                                            break;
                                    }
                                    break;
                            }
                        });
                        em.on('send' + haNum, function (data) { send(data) });
                        function send(data) {
                            try { socket.sendUTF(JSON.stringify(data)); }
                            catch (error) { log(error, 1, 3) }
                        }
                        function ping() {
                            if (client.reply == false) {
                                if (client.pingsLost < 2) {
                                    log("websocket (" + a.color("white", config.address) + ") ping never got replied in 10 sec", 1, 3);
                                    client.pingsLost++;
                                }
                                else { socket.close(); haReconnect("ping timeout"); return; }
                            }
                            client.reply = false;
                            client.timeStart = new Date().getMilliseconds();
                            send({ id: client.id++, type: "ping" });
                            setTimeout(() => { ping(); }, 10e3);
                        }
                        function haReconnect(error) {
                            log("websocket (" + a.color("white", config.address) + ") " + error.toString(), 1, 3);
                            ws[haNum].connect("ws://" + config.address + ":" + config.port + "/api/websocket");
                            setTimeout(() => { if (client.reply == false) { haReconnect("retrying..."); } }, 10e3);
                        }
                    });
                }
            },
            perf: function (num) {
                state.perf.ha[num].wait = false;
                let delay = Date.now() - state.perf.ha[num].start;
                if (delay < state.perf.ha[num].best) state.perf.ha[num].best = delay;
                if (delay > state.perf.ha[num].worst) state.perf.ha[num].worst = delay;
                let total = 0;
                if (state.perf.ha[num].last100Pos < 99) {
                    if (state.perf.ha[num].last100[state.perf.ha[num].last100Pos]) state.perf.ha[num].last100[state.perf.ha[num].last100Pos++] = delay;
                    else state.perf.ha[num].last100.push(delay);
                } else {
                    console.log(state.perf.ha);
                    if (state.perf.ha[num].last100[state.perf.ha[num].last100Pos]) state.perf.ha[num].last100[state.perf.ha[num].last100Pos] = delay;
                    else state.perf.ha[num].last100.push(delay);
                    state.perf.ha[num].last100Pos = 0;
                    state.perf.ha[num].worst = 0;
                    state.perf.ha[num].best = 1000;
                }
                state.perf.ha[num].last100.forEach(element => { total += element });
                state.perf.ha[num].average = Math.floor(total / state.perf.ha[num].last100.length);
                return delay;
            }
        },
        sys = {
            udp: function (data, info) {
                let buf, port = info.port, registered = false, id = undefined,
                    haNum = undefined, time = Date.now();
                try { buf = JSON.parse(data); }
                catch (error) { log("A UDP client (" + info.address + ") is sending invalid JSON data: " + error, 3, 3); return; }
                // console.log(buf)
                sys.watchDog(time);
                checkUDPreg();
                switch (buf.type) {
                    case "heartBeat": state.udp[id].heartBeat = true; break; // heartbeat
                    case "espState":    // incoming state change (ESP)
                        if (cfg.esp.enable == true) {
                            for (let x = 0; x < cfg.esp.devices.length; x++) {
                                for (let y = 0; y < state.esp.entities[x].length; y++) {
                                    if (state.esp.entities[x][y].name == buf.obj.name) {
                                        sys.worker.esp.postMessage(
                                            { type: "espSend", obj: { name: buf.obj.name, id: state.esp.entities[x][y].id, state: buf.obj.state } });
                                        break;
                                    }
                                }
                            }
                        }
                        // log("incoming esp state: " + buf.obj.name + " data: " + buf.obj.state, 3, 0);
                        break;
                    case "espFetch":
                        log("incoming ESP Fetch request from client: " + state.udp[id].name, 3, 0);
                        for (let x = 0; x < state.esp.entities.length; x++) {
                            for (let y = 0; y < state.esp.entities[x].length; y++) {
                                for (let b = 0; b < state.udp[id].esp.length; b++) {
                                    if (state.udp[id].esp[b] == state.esp.entities[x][y].name) {
                                        log("sending ESP Device ID: " + b + "  Name:" + state.esp.entities[x][y].name + "  data: " + state.esp.entities[x][y].state, 3, 0);
                                        udp.send(JSON.stringify({ type: "espState", obj: { id: b, state: state.esp.entities[x][y].state } }), port);
                                    }
                                }
                            }
                        }
                        break;
                    case "haFetch":     // incoming state fetch request
                        log("Client " + id + " - " + a.color("white", state.udp[id].name) + " - requesting fetch", 3, 0);
                        ha.fetch(state.udp[id]);
                        break;
                    case "haQuery":     // HA all device list request
                        logs.haInputs = [];
                        for (let x = 0; x < cfg.homeAssistant.length; x++) {
                            logs.haInputs.push([]);
                            log("Client: " + state.udp[id].name + " is querying HA (" + a.color("white", cfg.homeAssistant[x].address) + ") entities", 3, 1);
                            hass[x].states.list()
                                .then(dbuf => { dbuf.forEach(element => { logs.haInputs[x].push(element.entity_id) }); })
                                .catch(err => {
                                    console.log("\nCannot connect to HA, IP address or token incorrect");
                                    process.exit();
                                });
                        }
                        udp.send(JSON.stringify({ type: "haQueryReply", obj: logs.haInputs }), port);
                        break;
                    case "haState":     // incoming state change (Home Assistant)
                        let sensor = undefined;
                        let haNum;
                        // console.log(buf)
                        for (let y = 0; y < cfg.homeAssistant.length; y++) {
                            for (let z = 0; z < logs.haInputs[y].length; z++) {
                                if (buf.obj.name == logs.haInputs[y][z]) {
                                    haNum = y;
                                    sensor = false;
                                    break;
                                } else {
                                    if (z == logs.haInputs[y].length - 1 && buf.obj.ip == cfg.homeAssistant[y].address) {
                                        haNum = y;
                                        sensor = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (sensor == undefined) {
                            if (buf.obj.unit != undefined && buf.obj.name != undefined) {
                                //      log("sensor name: " + buf.obj.name + "  value: " + buf.obj.state + " unit: " + buf.obj.unit, 0, 0);
                                hass[(buf.obj.haID == undefined) ? 0 : buf.obj.haID].states.update('sensor', "sensor." + buf.obj.name,
                                    { state: buf.obj.state, attributes: { state_class: 'measurement', unit_of_measurement: buf.obj.unit } });
                                return;
                            } else log("received invalid HA State setting: " + JSON.stringify(buf), 3, 3); return;
                        }
                        state.perf.ha[haNum].start = Date.now();
                        state.perf.ha[haNum].wait = true;
                        state.perf.ha[haNum].id = state.ha[haNum].ws.id;
                        let sort = ["input_boolean", "input_button", "switch"];
                        if (buf.obj.unit == undefined) {
                            log("Client: " + state.udp[id].name + " is setting HA entity: " + buf.obj.name + " to value: " + buf.obj.state, 3, 0);
                            for (let x = 0; x < sort.length; x++) {
                                if (buf.obj.name) {
                                    if (buf.obj.name.includes(sort[x])) {
                                        if (cfg.homeAssistant[haNum].legacyAPI == false) {
                                            em.emit('send' + haNum, {
                                                "id": state.ha[haNum].ws.id++,
                                                "type": "call_service",
                                                "domain": sort[x],
                                                "service": buf.obj.state == false ? 'turn_off' : 'turn_on',
                                                "target": { "entity_id": buf.obj.name }
                                            })
                                        } else {
                                            hass[haNum].services.call(buf.obj.state == false ? 'turn_off' : 'turn_on', sort[x], { entity_id: buf.obj.name })
                                                .then(dbuf => {
                                                    let delay = ha.perf(haNum);
                                                    log("delay was: " + delay, 0, 0);
                                                });
                                        }
                                        break;
                                    }
                                }
                            }
                            return;
                        }
                        break;
                    case "register":    // incoming registrations
                        state.udp[id].name = buf.name;
                        log("client " + id + " - " + a.color("white", buf.name) + " - is initiating new connection", 3, 1);
                        if (buf.obj.ha != undefined) {
                            log("client " + id + " - " + a.color("white", buf.name) + " - is registering Home Assistant entities", 3, 1);
                            buf.obj.ha.forEach(element => { state.udp[id].ha.push(element) });
                        }
                        if (buf.obj.esp != undefined) {
                            buf.obj.esp.forEach(element => {
                                log("client " + id + " - " + a.color("white", buf.name) + " - is registering ESP entity - "
                                    + a.color("green", element), 3, 1);
                                state.udp[id].esp.push(element)
                            });
                        }
                        if (buf.obj.telegram != undefined && buf.obj.telegram == true) {
                            log("client " + id + " - " + a.color("white", buf.name) + " - is registering as telegram agent", 3, 1);
                            state.telegram.port = info.port;
                        }
                        break;
                    case "log":         // incoming log messages from UDP clients
                        log(buf.obj.message, buf.obj.mod, buf.obj.level, port);
                        break;
                    case "diag":        // incoming UDP client Diag
                        //console.log(buf)
                        // console.log(buf.obj);
                        let diagBuf = { auto: [], ha: [], esp: [] };
                        if (buf.obj.state.ha)
                            for (let x = 0; x < buf.obj.state.ha.length; x++) {
                                diagBuf.ha.push({ name: state.udp[id].ha[x], state: buf.obj.state.ha[x] });
                            }
                        if (buf.obj.state.esp)
                            for (let x = 0; x < buf.obj.state.esp.length; x++) {
                                diagBuf.esp.push({ name: state.udp[id].esp[x], state: buf.obj.state.esp[x] });
                            }
                        for (let x = 0; x < buf.obj.state.auto.length; x++) {
                            diagBuf.auto.push(buf.obj.state.auto[x]);
                        }
                        diag[id] = { name: state.udp[id].name, ip: state.udp[id].ip, state: diagBuf, nv: buf.obj.nv }
                        break;
                    case "telegram":
                        log("receiving telegram data: " + buf.obj, 4, 0);
                        switch (buf.obj.class) {
                            case "send": bot.sendMessage(buf.obj.id, buf.obj.data, buf.obj.obj); break;
                            case "sub":
                                let userExist = false;
                                for (let x = 0; x < state.telegram.users.length; x++) {
                                    if (state.telegram.users[x] == buf.obj.id) userExist = true;
                                    break;
                                }
                                if (userExist == false) state.telegram.users.push(buf.obj.id);
                                break;
                        }
                        break;
                    case "test":
                        log("receiving test", 3, 0)
                        udp.send(JSON.stringify({ type: "async", obj: "test" }), port);
                        break;
                    default:            // default to heartbeat
                        break;
                }
                function checkUDPreg() {
                    for (let x = 0; x < state.udp.length; x++) {
                        if (state.udp[x].port == port) {
                            state.udp[x].time = time;
                            id = x;
                            registered = true;
                            break;
                        }
                    }
                    if (registered == false) {
                        id = state.udp.push({ name: buf.name, port: port, ip: info.address, time: time, ha: [], esp: [] }) - 1;
                        diag.push([]);
                        if (buf.type == "heartBeat") {
                            log("client " + id + " is unrecognized", 3, 2);
                            udp.send(JSON.stringify({ type: "udpReRegister" }), port);
                        }
                    }
                }
            },
            watchDog: function (time) {
                for (let x = 0; x < state.udp.length; x++) {
                    if (state.udp[x].heartBeat == true && time - state.udp[x].time >= 2000) {
                        //  log("removing stale client id: " + x, 3);
                        log("Client: " + state.udp[x].name + " has crashed!!", 3, 3);
                        state.udp.splice(x, 1);
                        diag.splice(x, 1);
                    }
                }
            },
            ipc: function (data) {      // Incoming inter process communication 
                // console.log(data)
                switch (data.type) {
                    case "esp":
                        switch (data.class) {
                            case "init":
                                log("initializing esp main thread state");
                                state.esp = data.obj;
                                break;
                            case "entity":
                                // console.log(state.esp)
                                state.esp.entities[data.obj.module].push({ name: data.obj.name, type: data.obj.type, id: data.obj.id, state: undefined })
                                break;
                            case "state":
                                //    console.log(state.esp.entities);
                                state.esp.entities[data.obj.id][data.obj.io].state = data.obj.state;
                                // console.log(state.esp.entities);
                                for (let a = 0; a < state.udp.length; a++) {        // scan all the UDP clients and find which one cares about this entity
                                    for (let b = 0; b < state.udp[a].esp.length; b++) {                 // scan each UDP clients registered ESP entity list
                                        if (state.udp[a].esp[b] == state.esp.entities[data.obj.id][data.obj.io].name) {     // if there's a match, send UDP client the data
                                            udp.send(JSON.stringify({ type: "espState", obj: { id: b, state: data.obj.state } }), state.udp[a].port);
                                            //   console.log("UDP Client: " + a + " esp: " + b + " state: ", data);
                                            break;
                                        }
                                    }
                                }
                                break;
                            case "discovery":
                                state.esp.discover = data.obj;
                                break;
                        }
                        break;
                    case "log": log(data.obj[0], data.obj[1], data.obj[2]); break;
                    case "udpSend":

                        break;
                }
            },
            boot: function (step) {
                switch (step) {
                    case 0:     // read config.json file
                        fs = require('fs')
                        workingDir = require('path').dirname(require.main.filename);
                        console.log("Loading config data...");
                        fs.readFile(workingDir + "/config.json", function (err, data) {
                            if (err) {
                                console.log("\x1b[31;1mCannot find config file, exiting\x1b[37;m"
                                    + "\nconfig.json file should be in same folder as core.js file");
                                process.exit();
                            }
                            else { cfg = JSON.parse(data); sys.boot(1); }
                        });
                        break;
                    case 1:     // read nv.json file
                        console.log("Initializing workers");
                        if (cfg.esp && cfg.esp.enable == true) {               // load worker threads
                            console.log("ESP thread initiating...");
                            sys.worker.esp = new Worker(__filename, { workerData: { threadId: "ESP" } });
                            sys.worker.esp.on('message', (data) => sys.ipc(data));
                            sys.worker.esp.postMessage({ type: "config", obj: cfg });
                        }
                        sys.boot(2);
                        return;
                        console.log("Loading non-volatile data...");
                        fs.readFile(workingDir + "/nv.json", function (err, data) {
                            if (err) {
                                console.log("\x1b[33;1mNon-Volatile Storage does not exist\x1b[37;m"
                                    + "\nnv.json file should be in same folder as core.js file");
                                nv = { telegram: [] };
                                sys.boot(2);
                            }
                            else { nv = JSON.parse(data); }
                        });
                        break;
                    case 2:     // state init and load modules
                        sys.lib();
                        sys.init();
                        log("initializing system states done");
                        log("checking args");
                        sys.checkArgs();
                        log("specified Working Directory: " + cfg.workingDir);
                        log("actual working directory: " + workingDir);
                        udp.on('listening', () => { log("starting UDP Server - Interface: 127.0.0.1 Port: 65432"); });
                        udp.on('error', (err) => { console.error(`udp server error:\n${err.stack}`); udp.close(); });
                        udp.on('message', (msg, info) => { sys.udp(msg, info); });
                        udp.bind(65432, "127.0.0.1");
                        if (cfg.webDiag) {
                            express.get("/el", function (request, response) { response.send(logs.esp); });
                            express.get("/log", function (request, response) { response.send(logs.sys); });
                            express.get("/tg", function (request, response) { response.send(logs.tg); });
                            express.get("/ws", function (request, response) { response.send(logs.ws); });
                            express.get("/nv", function (request, response) { response.send(nv); });
                            express.get("/state", function (request, response) { response.send(state); });
                            express.get("/cfg", function (request, response) { response.send(cfg); });
                            express.get("/perf", function (request, response) { response.send(state.perf); });
                            express.get("/esp", function (request, response) { response.send(state.esp); });
                            express.get("/udp", function (request, response) { response.send(state.udp); });
                            express.get("/ha", function (request, response) {
                                for (let x = 0; x < cfg.homeAssistant.length; x++) {
                                    logs.haInputs[x] = [];
                                    hass[x].states.list()
                                        .then(data => {
                                            data.forEach(element => { logs.haInputs[x].push(element.entity_id) });
                                            if (cfg.homeAssistant.length - 1 == x) response.send(logs.haInputs);
                                        })
                                        .catch(err => { log("fetching failed", 0, 2); });
                                }

                            });
                            express.get("/diag", function (request, response) {
                                for (let x = 0; x < state.udp.length; x++) {
                                    udp.send(JSON.stringify({ type: "diag" }), state.udp[x].port);
                                }
                                setTimeout(() => { response.send(diag); }, 100);
                            })
                            serverWeb = express.listen(cfg.webDiagPort, function () { log("diag web server starting on port " + cfg.webDiagPort, 0); });
                        }
                        if (cfg.telegram && cfg.telegram.enable == true) {
                            TelegramBot = require('node-telegram-bot-api');
                            if (cfg.telegram.token != undefined && cfg.telegram.token.length < 40) {
                                log(a.color("red", "Telegram API Token is invalid", 3));
                            } else {
                                log("starting Telegram service...");
                                bot = new TelegramBot(cfg.telegram.token, { polling: true });
                                //   bot.on("polling_error", (msg) => console.log(msg));
                                bot.on('message', (msg) => {
                                    if (logs.tg[logs.tgStep] == undefined) logs.tg.push(msg);
                                    else logs.tg[logs.tgStep] = msg;
                                    if (logs.tgStep < 100) logs.tgStep++; else logs.tgStep = 0;
                                    // user.telegram.agent(msg);]
                                    udp.send(JSON.stringify({ type: "telegram", obj: { class: "agent", data: msg } }), state.telegram.port);
                                });
                                bot.on('callback_query', (msg) => {
                                    udp.send(JSON.stringify({ type: "telegram", obj: { class: "callback", data: msg } }), state.telegram.port);
                                    // user.telegram.response(msg)
                                });
                                state.telegram.started = true;
                            }
                        }
                        sys.boot(3);
                        break;
                    case 3:     // connect to Home Assistant
                        if (cfg.homeAssistant) {
                            for (let x = 0; x < cfg.homeAssistant.length; x++) {
                                if (cfg.homeAssistant[x].enable == true) {
                                    haconnect();
                                    log("Legacy API - connecting to " + a.color("white", cfg.homeAssistant[x].address), 1);
                                    function haconnect() {
                                        hass[x].status()
                                            .then(data => {
                                                log("Legacy API (" + a.color("white", cfg.homeAssistant[x].address) + ") service: " + a.color("green", data.message), 1);
                                                log("Legacy API (" + a.color("white", cfg.homeAssistant[x].address) + ") fetching available inputs", 1);
                                                hass[x].states.list()
                                                    .then(data => {
                                                        if (data.includes("401: Unauthorized"))
                                                            log("Legacy API (" + a.color("white", cfg.homeAssistant[x].address) + ") Connection failed:" + data, 1, 3)
                                                        else {
                                                            data.forEach(element => { logs.haInputs[x].push(element.entity_id) });
                                                            if (x == cfg.homeAssistant.length - 1) sys.boot(4);
                                                        }
                                                    })
                                                    .catch(err => {
                                                        log(err, 1, 2);
                                                        log("Legacy API - connection to (" + a.color("white", cfg.homeAssistant[x].address) + ") failed, retrying in 10 seconds", 3);
                                                        setTimeout(() => {
                                                            haconnect();
                                                        }, 10e3);
                                                    });
                                            })
                                            .catch(err => {
                                                setTimeout(() => {
                                                    log("Legacy API (" + a.color("white", cfg.homeAssistant[x].address) + ") service: Connection failed, retrying....", 1, 2)
                                                    haconnect();
                                                }, 10e3);
                                                log(err, 1, 2);
                                            });
                                    }
                                } else if (x == cfg.homeAssistant.length - 1) sys.boot(4);
                            }
                        } else sys.boot(4);
                        break;
                    case 4:     // start system timer - starts when initial HA Fetch completes
                        log("stating websocket service...");
                        if (cfg.homeAssistant) ha.ws();
                        setInterval(() => sys.time.timer(), 1000);
                        break;
                }
            },
            init: function () { // initialize system volatile memory
                state = { udp: [], ha: [], perf: { ha: [] } };
                diag = [];      // array for each UDP client diag
                ws = [];
                hass = [];
                time = { date: undefined, month: 0, day: 0, dow: 0, dayLast: undefined, hour: 0, hourLast: undefined, min: 0, minLast: undefined, sec: 0, up: 0, ms: 0, millis: 0, stamp: "" };
                logs = { step: 0, sys: [], ws: [], tg: [], tgStep: 0, haInputs: [], esp: [] };
                sys.time.sync();
                time.minLast = time.min;
                time.hourLast = time.hour;
                time.dayLast = time.day;
                if (cfg.homeAssistant) {
                    for (let x = 0; x < cfg.homeAssistant.length; x++) {
                        logs.ws.push([]);
                        logs.haInputs.push([]);
                        state.ha.push({ ws: {} });
                        ws.push(new WebSocketClient());
                        hass.push(new HomeAssistant({
                            host: "http://" + cfg.homeAssistant[x].address,
                            port: cfg.homeAssistant[x].port,
                            token: cfg.homeAssistant[x].token,
                            ignoreCert: true
                        }));
                        state.ha[x].ws =
                        {
                            timeout: null, // used for esp reset 
                            logStep: 0,
                            error: false,
                            id: 1,
                            reply: true,
                            pingsLost: 0,
                            timeStart: 0,
                        };
                        state.perf.ha.push(
                            {
                                best: 1000,
                                worst: 0,
                                average: 0,
                                id: 0,
                                start: 0,
                                wait: false,
                                last100Pos: 0,
                                last100: [],
                            }
                        );
                    };
                }
                state.esp = { discover: [], entities: [] };
                state.telegram = { started: false, users: [] };
            },
            lib: function () {
                a = {
                    color: function (color, input, ...option) {   //  ascii color function for terminal colors
                        if (input == undefined) input = '';
                        let c, op = "", bold = ';1m', vbuf = "";
                        for (let x = 0; x < option.length; x++) {
                            if (option[x] == 0) bold = 'm';         // bold
                            if (option[x] == 1) op = '\x1b[5m';     // blink
                            if (option[x] == 2) op = '\u001b[4m';   // underline
                        }
                        switch (color) {
                            case 'black': c = 0; break;
                            case 'red': c = 1; break;
                            case 'green': c = 2; break;
                            case 'yellow': c = 3; break;
                            case 'blue': c = 4; break;
                            case 'purple': c = 5; break;
                            case 'cyan': c = 6; break;
                            case 'white': c = 7; break;
                        }
                        if (input === true) return '\x1b[3' + c + bold;     // begin color without end
                        if (input === false) return '\x1b[37;m';            // end color
                        vbuf = op + '\x1b[3' + c + bold + input + '\x1b[37;m';
                        return vbuf;
                    }
                };
                util = require('util');
                exec = require('child_process').exec;
                execSync = require('child_process').execSync;
                HomeAssistant = require('homeassistant');
                expressLib = require("express");
                express = expressLib();
                WebSocketClient = require('websocket').client;
                events = require('events');
                em = new events.EventEmitter();
                udpServer = require('dgram');
                udp = udpServer.createSocket('udp4');
                file = {
                    write: {
                        nv: function () {  // write non-volatile memory to the disk
                            log("writing NV data...")
                            fs.writeFile(workingDir + "/nv-bak.json", JSON.stringify(nv), function () {
                                fs.copyFile(workingDir + "/nv-bak.json", workingDir + "/nv.json", (err) => {
                                    if (err) throw err;
                                });
                            });
                        }
                    },
                };
                log = function (message, mod, level, port) {      // add a new case with the name of your automation function
                    let
                        buf = sys.time.sync(), cbuf = buf + "\x1b[3", lbuf = "", mbuf = "", ubuf = buf + "\x1b[3";
                    if (level == undefined) level = 1;
                    switch (level) {
                        case 0: ubuf += "6"; cbuf += "6"; lbuf += "|--debug--|"; break;
                        case 1: ubuf += "4"; cbuf += "7"; lbuf += "|  Event  |"; break;
                        case 2: ubuf += "3"; cbuf += "3"; lbuf += "|*Warning*|"; break;
                        case 3: ubuf += "1"; cbuf += "1"; lbuf += "|!!ERROR!!|"; break;
                        case 4: ubuf += "5"; cbuf += "5"; lbuf += "|~~DTEST~~|"; break;
                        default: ubuf += "4"; cbuf += "4"; lbuf += "|  Event  |"; break;
                    }
                    buf += lbuf;
                    cbuf += "m" + lbuf + "\x1b[37;m";
                    ubuf += ";1m" + lbuf + "\x1b[37;m";
                    switch (mod) {      // add a new case with the name of your automation function, starting at case 3
                        case 0: mbuf += " system | "; break;
                        case 1: mbuf += "     HA | "; break;
                        case 2: mbuf += "    ESP | "; break;
                        case 3: mbuf += "    UDP | "; break;
                        case 4: mbuf += "Telegram| "; break;
                        default:
                            if (mod != undefined) ubuf += mod + " | ";
                            else mbuf += " system | ";
                            break;
                    }
                    buf += mbuf + message;
                    cbuf += mbuf + message;
                    ubuf += mbuf + message;
                    if (logs.sys[logs.step] == undefined) logs.sys.push(buf);
                    else logs.sys[logs.step] = buf;
                    if (logs.step < 500) logs.step++; else logs.step = 0;
                    if (cfg.telegram != undefined && cfg.telegram.enable == true && state.telegram.started == true) {
                        if (level >= cfg.telegram.logLevel
                            || level == 0 && cfg.telegram.logDebug == true) {
                            for (let x = 0; x < state.telegram.users.length; x++) {
                                if (cfg.telegram.logESPDisconnect == false) {
                                    if (!message.includes("ESP module went offline, resetting ESP system:")
                                        || !message.includes("ESP module is reconnected: ")
                                        || !message.includes("ESP Module has gone offline: ")) {
                                        bot.sendMessage(state.telegram.users[x], buf);
                                    }
                                } else bot.sendMessage(state.telegram.users[x], buf);
                            }
                        }
                    }
                    if (port != undefined) {
                        console.log(ubuf);
                        udp.send(JSON.stringify({ type: "log", obj: ubuf }), port);
                    } else if (level == 0 && cfg.debugging == true) console.log(cbuf);
                    else if (level != 0) console.log(cbuf);
                    return buf;
                };
            },
            checkArgs: function () {
                if (process.argv[2] == "-i") {
                    log("installing ThingWerks-Core service...");
                    let service = [
                        "[Unit]",
                        "Description=\n",
                        "[Install]",
                        "WantedBy=multi-user.target\n",
                        "[Service]",
                        "ExecStart=nodemon " + cfg.workingDir + "core.js -w " + cfg.workingDir + "core.js",
                        "Type=simple",
                        "User=root",
                        "Group=root",
                        "WorkingDirectory=" + cfg.workingDir,
                        "Restart=on-failure\n",
                    ];
                    fs.writeFileSync("/etc/systemd/system/tw-core.service", service.join("\n"));
                    // execSync("mkdir /apps/ha -p");
                    // execSync("cp " + process.argv[1] + " /apps/ha/");
                    execSync("systemctl daemon-reload");
                    execSync("systemctl enable tw-core.service");
                    execSync("systemctl start tw-core");
                    execSync("service tw-core status");
                    log("service installed and started");
                    console.log("type: journalctl -f -u tw-core");
                    process.exit();
                }
            },
            time: {
                sync: function () {
                    time.date = new Date();
                    time.ms = time.date.getMilliseconds();
                    time.sec = time.date.getSeconds();
                    time.min = time.date.getMinutes();
                    time.hour = time.date.getHours();
                    time.dow = time.date.getDay();
                    time.day = time.date.getDate();
                    time.month = time.date.getMonth();
                    time.stamp = ("0" + time.month).slice(-2) + "-" + ("0" + time.day).slice(-2) + " "
                        + ("0" + time.hour).slice(-2) + ":" + ("0" + time.min).slice(-2) + ":"
                        + ("0" + time.sec).slice(-2) + "." + ("00" + time.ms).slice(-3);
                    return time.stamp;
                },
                timer: function () {    // called every second
                    if (time.minLast != time.min) { time.minLast = time.min; everyMin(); }
                    time.up++;
                    sys.time.sync();
                    sys.watchDog(time.date);
                    function everyMin() {
                        if (time.hourLast != time.hour) { time.hourLast = time.hour; everyHour(); }
                        for (let x = 0; x < state.udp.length; x++) {
                            udp.send(JSON.stringify({ type: "timer", obj: { day: time.day, dow: time.dow, hour: time.hour, min: time.min } }), state.udp[x].port);
                        }
                    }
                    function everyHour() {
                        if (time.dayLast != time.day) { time.dayLast = time.day; everyDay(); }
                    }
                    function everyDay() {
                    }
                },
            },
            worker: {},
        };
    sys.boot(0);
}
if (!isMainThread) {
    const data = workerData;
    if (data.threadId === "ESP") {
        let sys = {
            init: function () {
                espClient = [];
                state = { esp: { discover: [], entities: [], reconnect: [] } };
                sys.lib();
            },
            lib: function () {
                events = require('events');
                em = new events.EventEmitter();
                a = {
                    color: function (color, input, ...option) {   //  ascii color function for terminal colors
                        if (input == undefined) input = '';
                        let c, op = "", bold = ';1m', vbuf = "";
                        for (let x = 0; x < option.length; x++) {
                            if (option[x] == 0) bold = 'm';         // bold
                            if (option[x] == 1) op = '\x1b[5m';     // blink
                            if (option[x] == 2) op = '\u001b[4m';   // underline
                        }
                        switch (color) {
                            case 'black': c = 0; break;
                            case 'red': c = 1; break;
                            case 'green': c = 2; break;
                            case 'yellow': c = 3; break;
                            case 'blue': c = 4; break;
                            case 'purple': c = 5; break;
                            case 'cyan': c = 6; break;
                            case 'white': c = 7; break;
                        }
                        if (input === true) return '\x1b[3' + c + bold;     // begin color without end
                        if (input === false) return '\x1b[37;m';            // end color
                        vbuf = op + '\x1b[3' + c + bold + input + '\x1b[37;m';
                        return vbuf;
                    }
                };
            }
        }
        const { Client } = require('@2colors/esphome-native-api');
        const { Discovery } = require('@2colors/esphome-native-api');
        sys.init();
        function esp() {  // currently testing for outgoing signaling 
            espInit();                                                              // start the init sequence
            function espInit() {                                                    // create a new client for every ESP device in the local object
                for (let x = 0; x < cfg.esp.devices.length; x++) {
                    if (state.esp.reconnect[x] == undefined) state.esp.reconnect.push(false);  // create reconnect flag to prevent repeated logging of esp reconnect attempts
                    espClient.push(clientNew(x));
                    state.esp.entities.push([]);                                    // create entity array for each ESP device
                    clientConnect(x);
                }
                parentPort.postMessage({ type: "esp", class: "init", obj: state.esp }); // init/delete all client objects on main thread
            }
            function clientConnect(x) {
                if (state.esp.reconnect[x] == false) {
                    log("connecting to esp module: " + a.color("white", cfg.esp.devices[x].ip), 2);       // client connection function, ran for each ESP device
                }
                espClient[x].connect();
                espClient[x].on('newEntity', entity => {
                    if (state.esp.reconnect[x] == true) log("ESP module is reconnected: " + a.color("white", cfg.esp.devices[x].ip), 2, 2)
                    state.esp.reconnect[x] = false;
                    let exist = 0, io = null;
                    for (let e = 0; e < state.esp.entities[x].length; e++) {        // scan for this entity in the entity list
                        if (state.esp.entities[x][e].id == entity.id) { exist++; io = e; };
                    }
                    if (exist == 0)                                                 // dont add this entity if its already in the list 
                        io = state.esp.entities[x].push({ name: entity.config.objectId, type: entity.type, id: entity.id }) - 1;
                    log("new entity - connected - " + a.color("green", entity.config.objectId), 2);
                    parentPort.postMessage({ type: "esp", class: "entity", obj: { module: x, io: io, name: entity.config.objectId, type: entity.type, id: entity.id } });
                    if (entity.type === "Switch") {                                 // if this is a switch, register the emitter
                        em.on(entity.config.objectId, function (id, state) {        // emitter for this connection 
                            //  log("setting entity: " + id + " to " + state, 0, 0)
                            entity.connection.switchCommandService({ key: id, state: state });
                        });
                    }
                    entity.on('state', (data) => {
                        for (let y = 0; y < state.esp.entities[x].length; y++) {
                            if (state.esp.entities[x][y].id == data.key) {          // identify this entity request with local object
                                //      log("esp data: " + state.esp.entities[x][y].name + " state: " + data.state, 2, 0)
                                // console.log(state.esp.entities);
                                parentPort.postMessage({ type: "esp", class: "state", obj: { id: x, io: y, state: data.state }, });
                            }
                        }
                    });
                });
                espClient[x].on('error', (error) => {
                    //  console.log(error);
                    if (state.esp.reconnect[x] == false) {
                        log("ESP module went offline, resetting ESP system: " + a.color("white", cfg.esp.devices[x].ip), 2, 2);
                        state.esp.reconnect[x] = true;
                    }
                    reset();                                                        // if there's a connection problem, start reset sequence
                });
            }
            function clientNew(x) {                                                 // create new object for every ESP device 
                return new Client({
                    host: cfg.esp.devices[x].ip,
                    port: 6053,
                    encryptionKey: cfg.esp.devices[x].key,
                    reconnect: true,
                    reconnectInterval: 5000,
                    pingInterval: 3000,
                    pingAttempts: 3,
                    tryReconnect: false,
                })
            }
            function reset() {
                em.removeAllListeners();                                                // remove all event listeners 
                for (let c = 0; c < espClient.length; c++) espClient[c].disconnect();   // disconnect every client 
                espClient = [];
                state.esp.entities = [];                                                // delete all client objects 
                setTimeout(() => { espInit(); }, 100);                                  // reconnect to every device
            }
        }
        parentPort.on('message', (data) => {
            //   console.log(data.obj);
            //     log("incominig esp state request Data: " + data.obj, 2, 0);
            switch (data.type) {
                case "config":
                    cfg = data.obj;
                    log("ESP Discovery initiated...", 2);
                    Discovery().then(results => {
                        state.esp.discover = results;
                        parentPort.postMessage({ type: "esp", class: "discovery", obj: results });
                    });
                    log("ESP connections initiating...", 2);
                    esp();
                    break;
                case "espSend":
                    em.emit(data.obj.name, data.obj.id, data.obj.state);
                    break;
            }
        });
        function log(...buf) { parentPort.postMessage({ type: "log", obj: { ...buf } }); }
    }
}
