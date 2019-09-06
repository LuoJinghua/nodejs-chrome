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
		opt.args = opt.args.concat(['--proxy-server='+(opt.proxy.match('://') ? opt.proxy : (opt.proxy = 'http://'+opt.proxy)).replace(/(:\/\/:?)(.*?)@/gi, '$1')]);
	if (opt.device) {
		if (opt.device.userAgent)
			opt.args = opt.args.concat(['--user-agent='+opt.device.userAgent]);
		if (opt.device.viewport) {
			opt.defaultViewport = null;
			if (opt.device.viewport.width && opt.device.viewport.height)
				opt.args = opt.args.concat(['--window-size='+[opt.device.viewport.width, opt.device.viewport.height].join(',')]);
			if (opt.device.viewport.deviceScaleFactor)
				opt.args = opt.args.concat(['--force-device-scale-factor='+opt.device.viewport.deviceScaleFactor]);
			if (opt.device.viewport.hasTouch)
				opt.args = opt.args.concat(['--touch-events=enabled']);
			opt.args = opt.args.concat(['--disable-web-security']);
		}
	}
	ws = (await new Promise((resolve, reject) => {
		http.get('http://localhost:9222/json/version', (res, body='') => {
			res.on('data', (chunk) => (body += chunk));
			res.on('end', () => resolve(JSON.parse(body)));
		}).on('error', err => reject(err));
	}).then(e => ({
		browserWSEndpoint: e.webSocketDebuggerUrl
	})).catch(() => (chronos ? process.exit(console.error('Error: --remote-debugging-port=9222 => /etc/chrome_dev.conf')) : null)));
	browser = (await (ws ? puppeteer.connect(Object.assign(ws, opt)) : puppeteer.launch(Object.assign((lambda ? {
		args: lambda.args.concat((opt.args || [])),
		executablePath: await lambda.executablePath,
		headless: lambda.headless
	} : ((process.arch != 'x64') ? {
		executablePath: await new Promise((resolve, reject) => exec('which chromium-browser chromium', (err, data) => resolve(data.trim())))
	} : {})), opt))));
	browser.on('targetcreated', async target => ((target.type() === 'page') && (browser._page = await target.page())));
	return await (Object.assign(browser, {
		parent: {
			name: pt,
			module: puppeteer
		},
		_page: null,
		ws: ws,
		browser: browser,
		userDataDir: browser._process.spawnargs.filter(v => v.match('--user-data-dir=')).join('').split('=').slice(1, 2).join(),
		port: browser._connection._url.replace(/^ws:\/\/(?:.*?):(.*?)\/(?:.*?)$/, '$1'),
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
		tab: page => Object.assign(page, page.evaluateOnNewDocument(opt => {
			if (opt.device && opt.device.viewport && opt.device.viewport.isLandscape && window.screen && window.screen.orientation)
				Object.defineProperty(window.screen.orientation, 'type', {
					value: 'landscape-primary'
				});
			if (opt.device && opt.device.viewport && opt.device.viewport.hasTouch)
				Object.defineProperty(navigator, 'maxTouchPoints', {
					value: (opt.device.touchPoints || 1)
				});
			/*
			Element.prototype.documentOffsetTop = function() {
				return this.offsetTop + (this.offsetParent ? this.offsetParent.documentOffsetTop() : 0);
			};
			*/
			delete navigator.__proto__.webdriver
		}, opt), (opt.proxy && (opt.proxy.indexOf('@') > -1) && page.authenticate({
			username: opt.proxy.replace(/^(.*?):\/\/(.*?)@(.*?)$/gi, '$2').split(':')[0],
			password: opt.proxy.replace(/^(.*?):\/\/(.*?)@(.*?)$/gi, '$2').split(':')[1]
		})), {
			_proxy: (opt.proxy || null),
			_coords: null,
			_device: null,
			_pointer: false,
			focusTab: () => {
				var focus = browser._page;
				return page.bringToFront((browser._page = page)).then(() => focus);
			},
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
				try {
					await page.waitForSelector((o.selector_ || selector));
				} catch(e) {
					return (o.debug ? [] : null);
				}
				var els = await page.$$eval((o.selector_ || selector), (els, selector) => els.map(el => {
					var pos = el.getBoundingClientRect();
					return {
						title: el.innerText,
						url: el.href,
						visible: (
							((window.pageYOffset + pos.bottom) > window.pageYOffset) &&
							((window.pageYOffset + pos.top) < (window.pageYOffset + document.documentElement.clientHeight)) &&
							((window.pageXOffset + pos.right) > window.pageXOffset) &&
							((window.pageXOffset + pos.left) < (window.pageXOffset + document.documentElement.clientWidth))
						),
						selector: selector.filter(v => (document.querySelector(v) == el)).slice(-1).join(),
						selector_: (() => {
							var names = [];
							while (el.parentNode) {
								if (el.id) {
									names.unshift('#'+el.id);
									break;
								}else{
									if (el == el.ownerDocument.documentElement)
										names.unshift(el.tagName);
									else{
										for (var c=1,e=el;e.previousElementSibling;e=e.previousElementSibling,c++);
										names.unshift(el.tagName+':nth-child('+c+')');
									}
									el = el.parentNode;
								}
							}
							return names.join(' > ');
						})(),
						pos: JSON.parse(JSON.stringify(pos))
					};
				}), selector.split(',').reduce((out, v) => out.concat(v.split('->')).map(v => v.trim()), []));
				if (o.filter) {
					o.filter.k_ = Object.keys(o.filter).filter(k => (k != 'flags'))[0];
					els = els.filter(el => el[o.filter.k_].match(new RegExp(o.filter[o.filter.k_], o.filter.flags)));
				}
				if (o.debug)
					return els;
				if (!els[0])
					return null;
				if (o.eval)
					await page.$$eval(els.map(el => el.selector_).join(), (els, eval) => els.map(el => (new Function('el', eval))(el)), o.eval);
				if (!els[0].visible && (els[0].pos.width > 0) && (els[0].pos.height > 0)) {
					/*
					await page.evaluate(selector => {
						var el = document.querySelector(selector);
						window.scrollTo(0, (el.documentOffsetTop() - (window.innerHeight / 2)));
					}, (els[0].selector || selector));
					*/
					if (o.input)
						await page.evaluate(selector => document.querySelector(selector).scrollIntoView(), (els[0].selector || selector));
					else
						await page.evaluate(selector => document.querySelector(selector).scrollIntoView({
							behavior: 'smooth',
							block: 'center',
							inline: 'center'
						}), (els[0].selector || selector));
					await page.waitFor(1000);
					return page.tapClick((els[0].selector || selector), o);
				}else if (!els[0].visible && !els.sort((a, b) => (b.visible - a.visible))[0].visible) {
					await page.waitFor(1000);
					return page.tapClick(selector, o);
				}
				await page.waitFor(500);
				if ((page._viewport && !!page._viewport.hasTouch) || (opt.device && opt.device.viewport && opt.device.viewport.hasTouch))
					await page.touchscreen.tap((els[0].pos.x + els[0].pos.width / 2), (els[0].pos.y + els[0].pos.height / 2));
				else{
					var c = [(els[0].pos.x + (Math.floor(Math.random() * ((els[0].pos.width - 25) - 26)) + 25)), (els[0].pos.y + 10)]; // rand(25, (els[0].pos.width - 25))
					if (o.cursor !== false)
						await page.mouse.move(c[0], c[1], {
							steps: Math.floor(Math.random() * 19) + 10 // rand(10, 30)
						});
					await page.mouse.click(c[0], c[1]);
				}
				if (o.selector_ && (selector = selector.split(',').reduce((out, v) => {
					var is = false;
					return out.concat([v.split('->').filter(v => {
						return ((!is && (v.trim() == els[0].selector)) ? ((is = true) && false) : is);
					}).join('->')]);
				}, []).filter(Boolean).join(',')))
					return page.tapClick(selector, o);
				if (o.input) {
					await page.waitForSelector(els[0].selector_);
					await page.keyboard.type(o.input);
					if (o.send)
						await page.keyboard.down('Enter');
				}
				if (o.wait)
					await page.waitForNavigation();
				els[0].$$ = JSON.parse(JSON.stringify(els));
				return els[0];
			},
			json: () => page.$eval('pre', el => JSON.parse(el.innerText)), // page.evaluate(() => JSON.parse(document.body.innerText)),
			text: () => page.content(),
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
