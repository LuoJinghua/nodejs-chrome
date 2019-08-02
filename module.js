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
// EXAMPLE 3
var browser = await chrome({
	headless: true,
	proxy: 'http://91.82.42.2:43881'
});
var page = await browser.tabnew();
try {
	await page.setDevice({
		"name": "Mobile | Pixel 2",
		"userAgent": "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3765.0 Mobile Safari/537.36",
		"viewport": {
			"width": 411, "height": 731, "deviceScaleFactor": 2.625, "isMobile": true, "hasTouch": false, "isLandscape": false
		}
	});
	await page.setProxy('http://91.82.42.2:43881');
	await page.setUrl('https://ifconfig.io/all.json');
	console.log(JSON.parse(await page.$eval('body', el => el.innerText)).ip == '91.82.42.2');
} catch (e) {
	console.error(e);
}
return browser.exit();
*/
module.exports = (async (opt={}) => {
	try {
		var ws, browser,
			net = require('net'),
			http = require('http'),
			exec = require('child_process').exec,
			lambda = (process.argv[1].match('awslambda') && require('chrome-aws-lambda')),
			chronos = ((process.env.SUDO_USER || process.env.USER) == 'chronos'),
			pt = (((process.arch != 'x64') || chronos || lambda) ? 'puppeteer-core' : 'puppeteer'),
			request = ((pt == 'puppeteer') && require('request')),
			puppeteer = require((module.path || process.cwd()+'/node_modules/nodejs-chrome')+'/node_modules/'+pt);
	} catch (e) {
		throw (new Error('npm install'));
	}
	opt.args = (opt.args || []).concat(['--no-sandbox', '--disable-plugins']);
	if (opt.proxy)
		opt.args = opt.args.concat(['--proxy-server='+opt.proxy.replace(/(:\/\/:?)(.*?)@/gi, '$1')]);
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
	} : ((process.arch != 'x64') ? {
		executablePath: await new Promise((resolve, reject) => exec('which chromium-browser chromium', (err, data) => resolve(data.trim())))
	} : {})), opt)))), {
		parent: {
			name: pt,
			module: puppeteer
		},
		ws: ws,
		browser: browser,
		isHeadless: async () => ((await browser.version()).indexOf('HeadlessChrome') == 0),
		targetTab: (_page, _notnew) => browser.waitForTarget(_target => (_target.opener() === _page.target()), {
			timeout: 5000
		}).then(_target => _target.page().then(_tab => browser.tab(_tab)).then(async _tab => {
			await _tab.setOfflineMode(true); // TODO: придумать как оборвать соединение, чтоб не успели передаться данные
			if (_page._proxy)
				await _tab.setProxy(_page._proxy);
			if (_page._coords) {
				await _tab.setGeolocation((_tab._coords = _page._coords));
				browser.defaultBrowserContext().overridePermissions((new URL(_tab.url())).origin, ['geolocation']);
			}
			if (_page._pointer)
				await browser.pointer(_tab, !_notnew);
			if (!_page._device || !_page._device.viewport.hasTouch)
				await _tab.mouse.move(_page.mouse._x, _page.mouse._y);
			if (_page._device)
				await _tab.setDevice(_page._device);
			return _tab;
		})).catch(() => null),
		pointer: (_page, _new) => (_page._pointer = true) && _page[(_new ? 'evaluateOnNewDocument' : 'evaluate')](() => ((window === window.parent) && (() => window.addEventListener('DOMContentLoaded', () => {
			(class extends HTMLElement {
				constructor(...args) {
					super(...args);
					this.dom = this.attachShadow({mode: 'open'});
					this.dom.appendChild(this.css = document.createElement('style'));
					this.dom.appendChild(this.pointer = document.createElement('pointer'));
					this.css.innerHTML = `
						pointer {
							pointer-events: none; position: absolute; top: 0; z-index: 10000;
							left: 0; width: 20px; height: 20px; background: rgba(0, 0, 0, .4);
							border: 1px solid white; border-radius: 10px; margin: -10px 0 0 -10px;
							padding: 0; transition: background .2s, border-radius .2s, border-color .2s;
						}
						pointer[class*=mouse], pointer[class*=touch] { transition: none; }
						pointer.mouse-0 { background: rgba(0, 0, 0, 0.9); }
						pointer.touch-0 { background: rgba(255, 255, 255, 0.9); }
						pointer.mouse-1, pointer.touch-1 { border-color: rgba(0, 0, 255, 0.9); }
						pointer.mouse-2, pointer.touch-2 { border-radius: 4px; }
						pointer.mouse-3, pointer.touch-3 { border-color: rgba(255, 0, 0, 0.9); }
						pointer.mouse-4, pointer.touch-4 { border-color: rgba(0, 255, 0, 0.9); }
					`;
					document.addEventListener('pointermove', event => this.move(event));
					document.addEventListener('pointerdown', event => this.pointer.classList.add(event.pointerType+'-'+event.which, this.click(this.move(event))));
					document.addEventListener('pointerup', event => this.pointer.classList.remove(event.pointerType+'-'+event.which, this.click(this.move(event))));
					document.addEventListener('lostpointercapture', event => this.pointer.classList.remove(event.pointerType+'-'+event.which, this.click(event)));
				}
				move(event) {
					this.pointer.style.left = event.pageX+'px';
					this.pointer.style.top = event.pageY+'px';
					return event;
				}
				click(event) {
					for (var i = 0; i < 5; ++i) {
						this.pointer.classList.toggle(event.pointerType+'-'+i, event.buttons & (1 << i));
					}
				}
				init() {
					if (!customElements.get('app-pointer'))
						window.customElements.define('app-pointer', this.constructor);
				}
				run() {
					this.init(document.body.appendChild(document.createElement('app-pointer')));
				}
			}).prototype.run();
		}, false))())),
		tab: page => Object.assign(page, page.evaluateOnNewDocument(() => (delete navigator.__proto__.webdriver)), (opt.proxy && (opt.proxy.indexOf('@') > -1) && page.authenticate({
			username: opt.proxy.replace(/^(.*?):\/\/(.*?)@(.*?)$/gi, '$2').split(':')[0],
			password: opt.proxy.replace(/^(.*?):\/\/(.*?)@(.*?)$/gi, '$2').split(':')[1]
		})), {
			_proxy: (opt.proxy || null),
			_coords: null,
			_device: null,
			_pointer: false,
			setGeoPosition: coords => (page._coords = coords),
			setUrl: async (url, opt={}) => {
				if (page._coords) {
					await page.setGeolocation(page._coords);
					browser.defaultBrowserContext().overridePermissions((new URL(url)).origin, ['geolocation']);
				}
				return await page.goto(url, opt);
			},
			fetch: async req => {
				if (!page._proxy) // if (!req.headers['proxy']) // if (['document', 'xhr'].indexOf(req.resourceType()) === -1)
					req.continue();
				else{
					var res = await (new Promise((resolve, reject) => request({
						uri: req.url(),
						method: req.method(),
						headers: req.headers(),
						body: req.postData(),
						usingProxy: true,
						tunnel: true,
						strictSSL: false,
						proxy: page._proxy,
						resolveWithFullResponse: true
					}, (err, res, body) => (err ? reject(err) : resolve(res)))));
					req.respond({
						status: res.statusCode,
						contentType: res.headers['content-type'],
						headers: res.headers,
						body: res.body
					});
				}
			},
			setProxy: async proxy => {
				if (!request) {
					if (!opt.proxy && proxy)
						throw (new Error('For this architecture, use: chrome({proxy: \''+proxy+'\'})'));
				}else{
					if (opt.proxy)
						throw (new Error('you use a proxy: chrome({proxy: \''+opt.proxy+'\'})'));
					else{
						await page.setRequestInterception(true);
						page.removeListener('request', page.fetch);
						if (!page._proxy && proxy) {
							page._proxy = proxy;
							page.on('request', page.fetch);
						}
					}
				}
			},
			setDevice: device => page.emulate((page._device = device)),
			tapClick: async (selector, o={}) => {
				o.selector_ = (selector.match(/->/g) ? selector.replace(/->(?:.*?)(,|$)/g, '$1') : null);
				await page.waitForSelector((o.selector_ || selector)); // await page.waitForNavigation();
				var els = await page.$$eval((o.selector_ || selector), (els, selector) => els.map(el => ({
					title: el.innerText,
					url: el.href,
					selector: (selector && selector.filter(v => (document.querySelector(v) == el)).slice(-1).join()),
					pos: JSON.parse(JSON.stringify(el.getBoundingClientRect()))
				})), (o.selector_ && selector.split(',').reduce((out, v) => out.concat(v.split('->')).map(v => v.trim()), [])));
				if (o.filter) {
					o.filter.k_ = Object.keys(o.filter).filter(k => (k != 'flags'))[0];
					els = els.filter(el => el[o.filter.k_].match(new RegExp(o.filter[o.filter.k_], o.filter.flags)));
				}
				if (!els[0])
					return null;
				if (!!page._viewport.hasTouch)
					await page.touchscreen.tap((els[0].pos.x + els[0].pos.width / 2), (els[0].pos.y + els[0].pos.height / 2));
				else{
					var c = [(els[0].pos.x + (Math.floor(Math.random() * ((els[0].pos.width - 25) - 26)) + 25)), (els[0].pos.y + 10)]; // rand(25, (els[0].pos.width - 25))
					await page.mouse.move(c[0], c[1], {
						steps: Math.floor(Math.random() * 19) + 10 // rand(10, 30)
					});
					await page.mouse.click(c[0], c[1]);
				}
				if (els[0].selector && (selector = selector.split(',').reduce((out, v) => {
					var is = false;
					return out.concat([v.split('->').filter(v => {
						return ((!is && (v.trim() == els[0].selector)) ? ((is = true) && false) : is);
					}).join('->')]);
				}, []).filter(Boolean).join(',')))
					return page.tapClick(selector, o);
				if (o.input) {
					await page.keyboard.type(o.input);
					if (o.send)
						await page.keyboard.down('Enter');
				}
				if (o.wait)
					await page.waitForNavigation();
				return els[0];
			},
			pointer: () => browser.pointer(page, true),
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
		}),
		tabnew: () => browser.newPage().then(page => browser.tab(page)),
		exit: () => browser[(browser._process ? 'close' : 'disconnect')]()
	}));
});
