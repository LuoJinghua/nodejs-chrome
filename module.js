/*
// EXAMPLE 1
chrome.Proxy = require('proxy-chain');
chrome.Proxy.port = '8000';
await (tab = await (browser = await require('nodejs-chrome')()).tabnew());
await tab.setProxy('http://200.255.122.170:8080');
await tab.setUrl('http://example.com');
console.log(await tab.eval(_ => {
	return (new Function(..._.toObject))(document.querySelector('video'));
}));
await tab.exit();
await browser.exit();
// EXAMPLE 2
require('nodejs-chrome')().then(browser => {
	browser.tabnew().then(tab => {
		tab.setUrl('http://ifconfig.io/ip').then(res => res.text()).then(text => {
			tab.exit().then(() => browser.exit().then(() => console.log(text.trim())));
		});
	});
});
*/
module.exports = (async (opt={}) => {
	try {
		var proxy, ws, browser,
			net = require('net'),
			http = require('http'),
			exec = require('child_process').exec,
			lambda = (process.argv[1].match('awslambda') && require('chrome-aws-lambda')),
			chronos = ((process.env.SUDO_USER || process.env.USER) == 'chronos'),
			puppeteer = require(module.path+'/node_modules/'+(((process.arch != "x64") || chronos || lambda) ? 'puppeteer-core' : 'puppeteer'));
	} catch (e) {
		process.exit(console.error('Error: npm install'));
	}
	if (module.exports.Proxy && ('Server' in module.exports.Proxy)) {
		(proxy = new module.exports.Proxy.Server({
			port: ((chronos ? 8000 : module.exports.Proxy.port) || (await (new Promise((resolve, reject) => {
				var server = net.createServer().on('error', reject).unref().listen(port => ((port = server.address().port) && server.close(() => resolve(port))));
			})))),
			prepareRequestFunction: ({
				request, username, password, hostname, port, isHttp, connectionId
			}) => ((request.headers && request.headers.proxy) ? {
				upstreamProxyUrl: ((request.headers.proxy.indexOf('://') == -1) ? 'http://' : '')+request.headers.proxy
			} : null)
		})).listen(() => console.log('Proxy server is listening on port '+proxy.port));
		opt.args = (opt.args || []).concat(['--proxy-server=http://127.0.0.1:'+proxy.port]);
	}
	ws = (await new Promise((resolve, reject) => {
		http.get('http://localhost:9222/json/version', (res, body='') => {
			res.on('data', (chunk) => (body += chunk));
			res.on('end', () => resolve(JSON.parse(body)));
		}).on('error', err => reject(err));
	}).then(e => ({
		browserWSEndpoint: e.webSocketDebuggerUrl
	})).catch(() => (chronos ? process.exit(console.error('Error: --remote-debugging-port=9222 => /etc/chrome_dev.conf')) : null)));
	return await (Object.assign(browser = (await (ws ? puppeteer.connect(Object.assign(ws, opt)) : puppeteer.launch(Object.assign((lambda ? {
		args: lambda.args.concat((opt.args || [])),
		executablePath: await lambda.executablePath,
		headless: lambda.headless
	} : ((process.arch != "x64") ? {
		executablePath: await new Promise((resolve, reject) => exec('which chromium-browser chromium', (err, data) => resolve(data.trim())))
	} : {})), opt)))), {
		Proxy: module.exports.Proxy,
		proxy: proxy,
		ws: ws,
		browser: browser,
		tabnew: async page => (page = Object.assign((await browser.newPage()), {
			setUrl: (url, opt={}) => page.goto(url, opt),
			setProxy: (module.exports.Proxy ? proxy => page.setExtraHTTPHeaders({
				proxy: proxy
			}) : null),
			eval: (...args) => page.evaluate(...(args.concat([{
				toObject: ['el', `
					obj = {}
					for (var p in el) {
						obj[p] = el[p];
					}
					return obj;
				`],
			}]))),
			exit: () => page.close({
				runBeforeUnload: true
			})
			/* exit: () => {
				if (browser._process)
					return page.close();
				else
					return new Promise((resolve, reject) => page.close(browser.on('targetdestroyed', () => resolve())));
			} */
		})),
		exit: () => {
			if (proxy)
				proxy.close();
			return browser[(browser._process ? 'close' : 'disconnect')]();
		}
	}));
});
