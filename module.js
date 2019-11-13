module.exports = (async (opt={}) => {
	try {
		var ws, browser, _ssh,
			{ exec, spawn } = require('child_process'),
			fs = require('fs'),
			net = require('net'),
			http = require('http'),
			https = require('https'),
			FormData = require('form-data'),
			lambda = (process.argv[1].match('awslambda') && require('chrome-aws-lambda')),
			chronos = ((process.env.SUDO_USER || process.env.USER) == 'chronos'),
			pt = (((process.arch != 'x64') || chronos || lambda) ? 'puppeteer-core' : 'puppeteer'),
			request = ((pt == 'puppeteer') && require('request')),
			puppeteer = require((module.path || process.cwd()+'/node_modules/nodejs-chrome')+'/node_modules/'+pt);
	} catch (e) {
		throw (new Error('npm install'));
	}
	if (opt.eval) {
		var form = new FormData();
		opt.eval = 'const browser = await puppeteer.launch();'+opt.eval.replace(/(?:(?:\/\*(?:[^*]|(?:\*+[^*\/]))*\*+\/)|(?:(?<!\:|\\\|\')\/\/.*))/g, '').trim();
		form.append('file', opt.eval.replace(/\.json\(\)/g, '.content()').replace(/\.text\(\)/g, '.content()').replace(/\.setUrl\(/g, '.goto(').replace(/browser\.tabnew\(/g, 'browser.newPage(').replace(/browser\.exit\(/g, 'browser.close('), {
			filename: 'blob',
			contentType: 'text/javascript'
		});
		return new Promise((resolve, reject) => form.pipe(https.request({
			hostname: 'backend-dot-try-puppeteer.appspot.com',
			port: 443,
			path: '/run',
			method: 'POST',
			headers: form.getHeaders(),
		}, res => {
			var chunks = [];
			res.on('data', chunk => chunks.push(chunk));
			res.on('end', async () => {
				var data = JSON.parse(Buffer.concat(chunks).toString());
				if (data.errors)
					return reject(data.errors);
				if (data.result && (opt.eval.indexOf('.screenshot(') > -1))
					await new Promise((resolve, reject) => fs.writeFile(JSON.parse(opt.eval.split('.screenshot(')[1].split(')')[0].replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ').replace(/'/g, '"')).path, Buffer.from(data.result.buffer.data), () => resolve()));
				if (data.log && (opt.eval.indexOf('.json()') > -1))
					return resolve(JSON.parse(data.log.split('<pre>')[1].split('</pre>')[0].trim()));
				else
					return resolve(data.log);
			});
		})));
	}
	opt.args = (opt.args || []).concat((opt.ssh ? [] : ['--no-sandbox', '--disable-plugins']));
	if (opt.headless !== false) {
		opt.env = (opt.env || {});
		if (opt.timeZone)
			opt.env.TZ = opt.timeZone;
	}
	if (opt.lang)
		opt.args = opt.args.concat(['--lang='+opt.lang]);
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
	if (opt.ssh) {
		_ssh = {
			auth: (module.path || process.cwd()+'/node_modules/nodejs-chrome')+'/Auth.exp',
			pass: opt.ssh.replace(/^(.*?):(.*?)@(.*?)$/gi, '$2'),
			host: opt.ssh.replace(/^(.*?):(.*?)@(.*?)$/gi, '$1@$3')
		}
		// sudo sshfs -o password_stdin -o allow_other user@192.168.43.189:tmp/ ./ <<< "0000"
		// sudo sshfs -o password_stdin,allow_other user@192.168.43.189:tmp/ ./ <<< "0000"
		// sudo sshfs -o allow_other alexsmith2844@192.168.43.189:tmps/ ./
		// sudo umount ./
		// ssh -N -R 2020:localhost:22 alexsmith2844@192.168.43.189 -p 22
		// sudo sshfs -oStrictHostKeyChecking=no -o allow_other -p 2020 alexsmith2844@localhost:/home/alexsmith2844/.sync/test ./
		if (opt.userDataDir) {
			_ssh.uid = 'nodejs-chrome_'+new Array(10).join().replace(/(.|$)/g, () => ((Math.random()*36)|0).toString(36)[Math.random()<.5?"toString":"toUpperCase"]());
			await new Promise((resolve, reject) => exec([
				'expect', _ssh.auth, _ssh.pass, 'rsync -avu --delete', '"'+opt.userDataDir+'/"', '"'+_ssh.host+':/tmp/'+_ssh.uid+'"'
			].join(' '), (err, data) => resolve(data.trim())));
			opt.args.push('--user-data-dir=/tmp/'+_ssh.uid);
		}
		ws = {
			browserWSEndpoint: (await new Promise((resolve, reject) => {
				(_ssh.process = spawn('expect', [
					_ssh.auth, _ssh.pass, 'ssh', '-t', '-L', '9222:localhost:9222', _ssh.host,
					'DISPLAY=:0', (opt.timeZone ? 'TZ='+opt.timeZone : ''), '$(which chromium-browser chromium)', '--remote-debugging-port=9222'
				].concat(opt.args.map(v => (v.match('=') ? v.split('=')[0]+'="'+v.split('=')[1]+'"' : v))))).stdout.on('data', async data => {
					if (/DevTools listening on /.test((data = data.toString()))) {
						var _ws = data.split('DevTools listening on ')[1].trim();
						if (opt.userDataDir)
							fs.writeFileSync(opt.userDataDir+'/DevToolsActivePort', '9222\n'+_ws.split(':9222')[1]);
						resolve(_ws);
					}
				});
			}))
		}
	}else
		ws = (opt.ws || (await new Promise((resolve, reject) => {
			http.get('http://localhost:9222/json/version', (res, body='') => {
				res.on('data', (chunk) => (body += chunk));
				res.on('end', () => resolve(JSON.parse(body)));
			}).on('error', err => reject(err));
		}).then(e => ({
			browserWSEndpoint: e.webSocketDebuggerUrl
		})).catch(() => (chronos ? process.exit(console.error('Error: --remote-debugging-port=9222 => /etc/chrome_dev.conf')) : null))));
	browser = (await (ws ? puppeteer.connect(Object.assign(ws, opt)) : puppeteer.launch(Object.assign((lambda ? {
		args: lambda.args.concat((opt.args || [])),
		executablePath: await lambda.executablePath,
		headless: lambda.headless
	} : ((process.arch != 'x64') ? {
		executablePath: await new Promise((resolve, reject) => exec('which chromium-browser chromium', (err, data) => resolve(data.trim())))
	} : {})), opt))));
	if (opt.ssh)
		browser._process = _ssh.process;
	browser.on('targetcreated', async target => ((target.type() === 'page') && (browser._page = await target.page())));
	return await (Object.assign(browser, {
		parent: {
			name: pt,
			module: puppeteer
		},
		_page: null,
		ws: ws,
		browser: browser,
		userDataDir: (opt.ssh ? (opt.userDataDir || null) : browser._process && browser._process.spawnargs.filter(v => v.match('--user-data-dir=')).join('').split('=').slice(1, 2).join()),
		port: browser._connection._url.replace(/^ws:\/\/(?:.*?):(.*?)\/(?:.*?)$/, '$1'),
		isHeadless: async () => ((await browser.version()).indexOf('HeadlessChrome') == 0),
		targetTab: (_page, _notnew) => browser.waitForTarget(_target => (_target.opener() === _page.target()), {
			timeout: 5000
		}).then(_target => _target.page().then(_tab => browser.tab(_tab)).then(async _tab => {
			// await _tab.setOfflineMode(true); // TODO: придумать как оборвать соединение, чтоб не успели передаться данные
			if (_page._proxy && !opt.proxy)
				await _tab.setProxy(_page._proxy);
			if (_page._coords) {
				await _tab.setGeolocation((_tab._coords = _page._coords));
				browser.defaultBrowserContext().overridePermissions((new URL(_tab.url())).origin, ['geolocation']);
			}
			if (_page._pointer)
				await browser.pointer(_tab, !_notnew);
			if (!_page._device || !_page._device.viewport.hasTouch)
				await _tab.mouse.move(_page.mouse._x, _page.mouse._y);
			if (_page._device && !opt.device)
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
		tab: page => Object.assign(page, (ws ? {} : page.evaluateOnNewDocument(opt => {
			if (opt.device && opt.device.viewport && opt.device.viewport.isLandscape && window.screen && window.screen.orientation)
				Object.defineProperty(window.screen.orientation, 'type', {
					value: 'landscape-primary'
				});
			if (opt.device && opt.device.viewport && opt.device.viewport.hasTouch)
				Object.defineProperty(navigator, 'maxTouchPoints', {
					value: (opt.device.touchPoints || 1)
				});
			window.alert = window.confirm = () => {
				var now = new Date().getTime(),
					rand = Math.floor(100 + Math.random() * 901);
				while (new Date().getTime() < now + rand) {}
				return true;
			}
			if (!window.chrome)
				window.chrome = {
					app: { isInstalled: false }
				}
			if (!window.chrome.runtime)
				window.chrome.runtime = {
					PlatformOs: {
						ANDROID: 'android',
						CROS: 'cros',
						LINUX: 'linux',
						MAC: 'mac',
						OPENBSD: 'openbsd',
						WIN: 'win'
					},
					PlatformArch: {
						ARM: 'arm',
						MIPS: 'mips',
						MIPS64: 'mips64',
						X86_32: 'x86-32',
						X86_64: 'x86-64'
					},
					PlatformNaclArch: {
						ARM: 'arm',
						MIPS: 'mips',
						MIPS64: 'mips64',
						X86_32: 'x86-32',
						X86_64: 'x86-64'
					},
					RequestUpdateCheckStatus: {
						NO_UPDATE: 'no_update',
						THROTTLED: 'throttled',
						UPDATE_AVAILABLE: 'update_available'
					},
					OnInstalledReason: {
						CHROME_UPDATE: 'chrome_update',
						INSTALL: 'install',
						SHARED_MODULE_UPDATE: 'shared_module_update',
						UPDATE: 'update'
					},
					OnRestartRequiredReason: {
						APP_UPDATE: 'app_update',
						OS_UPDATE: 'os_update',
						PERIODIC: 'periodic',
					}
				}
			window.navigator.permissions.query = params => ((params.name === 'notifications') ? Promise.resolve({ state: Notification.permission }) : window.navigator.permissions.query(params));
			Object.defineProperties(navigator.connection, {
				rtt: { get: () => 200 },
				type: { get: () => 'wifi' },
			});
			try {
				if (!((navigator.plugins instanceof PluginArray) && (navigator.plugins.length > 0))) {
					const mockedFns = []
					const fakeData = {
						mimeTypes: [{
							type: 'application/pdf', suffixes: 'pdf', description: '', __pluginName: 'Chrome PDF Viewer'
						}, {
							type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', __pluginName: 'Chrome PDF Plugin'
						}, {
							type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable', enabledPlugin: Plugin, __pluginName: 'Native Client'

						}],
						plugins: [{
							name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format'
						}, {
							name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: ''
						}, {
							name: 'Native Client', filename: 'internal-nacl-plugin', description: ''
						}],
						fns: {
							namedItem: instanceName => {
								const fn = function (name) {
									if (!arguments.length)
										throw new TypeError(`Failed to execute 'namedItem' on '${instanceName}': 1 argument required, but only 0 present.`);
									return this[name] || null;
								}
								mockedFns.push({ ref: fn, name: 'namedItem' });
								return fn;
							},
							item: instanceName => {
								const fn = function (index) {
									if (!arguments.length)
										throw new TypeError(`Failed to execute 'namedItem' on '${instanceName}': 1 argument required, but only 0 present.`);
									return this[index] || null;
								}
								mockedFns.push({ ref: fn, name: 'item' });
								return fn;
							},
							refresh: instanceName => {
								const fn = function () {
									return undefined;
								}
								mockedFns.push({ ref: fn, name: 'refresh' });
								return fn;
							}
						}
					}
					const getSubset = (keys, obj) => keys.reduce((a, c) => ({ ...a, [c]: obj[c] }), {});
					function generateMimeTypeArray () {
						const arr = fakeData.mimeTypes.map(obj => getSubset(['type', 'suffixes', 'description'], obj)).map(obj => Object.setPrototypeOf(obj, MimeType.prototype));
						arr.forEach(obj => (arr[obj.type] = obj));
						arr.namedItem = fakeData.fns.namedItem('MimeTypeArray');
						arr.item = fakeData.fns.item('MimeTypeArray');
						return Object.setPrototypeOf(arr, MimeTypeArray.prototype);
					}
					const mimeTypeArray = generateMimeTypeArray();
					Object.defineProperty(navigator, 'mimeTypes', {
						get: () => mimeTypeArray
					});
					function generatePluginArray () {
						const arr = fakeData.plugins.map(obj => getSubset(['name', 'filename', 'description'], obj)).map(obj => {
							const mimes = fakeData.mimeTypes.filter(m => (m.__pluginName === obj.name));
							mimes.forEach((mime, index) => {
								navigator.mimeTypes[mime.type].enabledPlugin = obj;
								obj[mime.type] = navigator.mimeTypes[mime.type];
								obj[index] = navigator.mimeTypes[mime.type];
							});
							obj.length = mimes.length;
							return obj;
						}).map(obj => {
							obj.namedItem = fakeData.fns.namedItem('Plugin');
							obj.item = fakeData.fns.item('Plugin');
							return obj;
						}).map(obj => Object.setPrototypeOf(obj, Plugin.prototype));
						arr.forEach(obj => (arr[obj.name] = obj));
						arr.namedItem = fakeData.fns.namedItem('PluginArray');
						arr.item = fakeData.fns.item('PluginArray');
						arr.refresh = fakeData.fns.refresh('PluginArray');
						return Object.setPrototypeOf(arr, PluginArray.prototype);
					}
					const pluginArray = generatePluginArray();
					Object.defineProperty(navigator, 'plugins', {
						get: () => pluginArray
					});
					((fns = []) => {
						const oldCall = Function.prototype.call;
						function call () {
							return oldCall.apply(this, arguments);
						}
						Function.prototype.call = call;
						const nativeToStringFunctionString = Error.toString().replace(/Error/g, 'toString');
						const oldToString = Function.prototype.toString;
						function functionToString () {
							for (const fn of fns) {
								if (this === fn.ref)
									return `function ${fn.name}() { [native code] }`;
							}
							return ((this === functionToString) ? nativeToStringFunctionString : oldCall.call(oldToString, this));
						}
						Function.prototype.toString = functionToString;
					})(mockedFns);
				}
			} catch (err) {}
			/*
			if (navigator.plugins.length === 0)
				Object.defineProperty(navigator, 'plugins', {
					get: () => [1, 2, 3, 4, 5]
				});
			Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
				get: function() {
					return Object.assign({}, window);
				}
			});
			Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
				get: function() {
					return window;
				}
			});
			*/
			var prevX = 0,
				prevY = 0;
			Object.defineProperties(MouseEvent.prototype, {
				movementX: {
					get: function() {
						var movementX = (prevX ? this.screenX - prevX : 0);
						prevX = this.screenX;
						return movementX;
					}
				},
				movementY: {
					get: function() {
						var movementY = (prevY ? this.screenY - prevY : 0);
						prevY = this.screenY;
						return movementY;
					}
				}
			});
			/*
			Element.prototype.documentOffsetTop = function() {
				return this.offsetTop + (this.offsetParent ? this.offsetParent.documentOffsetTop() : 0);
			};
			*/
			delete navigator.__proto__.webdriver;
		}, opt)), (opt.proxy && (opt.proxy.indexOf('@') > -1) && page.authenticate({
			username: opt.proxy.replace(/^(.*?):\/\/(.*?)@(.*?)$/gi, '$2').split(':')[0],
			password: opt.proxy.replace(/^(.*?):\/\/(.*?)@(.*?)$/gi, '$2').split(':')[1]
		})), {
			_proxy: (opt.proxy || null),
			_coords: null,
			_device: null,
			_pointer: false,
			_viewport: (page._viewport || (opt.device ? opt.device.viewport : null)),
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
					var o_ = {};
					if (o.timeout)
						o_.timeout = o.timeout * 1000;
					await page.waitForSelector((o.selector_ || selector), o_);
				} catch(e) {
					return (o.debug ? [] : null);
				}
				var els = await page.eval(`(selector_, selector) => {
					return [...document.querySelectorAll(selector_)].map(el => {
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
					});
				}`, (o.selector_ || selector), selector.split(',').reduce((out, v) => out.concat(v.split('->')).map(v => v.trim()), []))
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
						await page.eval(`selector => document.querySelector(selector).scrollIntoView()`, (els[0].selector || selector));
						// await page.evaluate(selector => document.querySelector(selector).scrollIntoView(), (els[0].selector || selector));
					else
						await page.eval(`selector => document.querySelector(selector).scrollIntoView({
							behavior: 'smooth',
							block: 'center',
							inline: 'center'
						})`, (els[0].selector || selector));
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
			eval: async (pageFunction, ...args) => {
				var context = await await page._frameManager.mainFrame().executionContext(),
					suffix = `//# sourceURL=VM30`;
				var res = await context._client.send('Runtime.callFunctionOn', {
					functionDeclaration: pageFunction.toString()+'\n'+suffix+'\n',
					executionContextId: context._contextId,
					arguments: args.map(arg => ({value: arg})),
					returnByValue: true,
					awaitPromise: true,
					userGesture: true
				});
				if (res.exceptionDetails)
					throw new Error(res.exceptionDetails.exception.description);
				else if (res.result.value)
					return res.result.value;
			},
			back: async (fast) => {
				if (!fast && !page._viewport.hasTouch) {
					await page.mouse.move(10, 0, {
						steps: 50
					});
					await page.waitFor(1000);
				}
				return page.goBack();
			},
			exit: async (fast) => {
				if (!fast && !page._viewport.hasTouch) {
					await page.mouse.move(page._viewport.width, 0, {
						steps: 50
					});
					await page.waitFor(1000);
				}
				return page.close({
					runBeforeUnload: true
				})
			}
		}),
		tabnew: () => browser.newPage().then(page => browser.tab(page)),
		exit: () => (opt.ssh ? new Promise((resolve, reject) => {
			_ssh.process.kill();
			_ssh.process.stdout.on('end', async () => {
				if (_ssh.uid)
					await new Promise((resolve, reject) => exec([
						'expect', _ssh.auth, _ssh.pass, 'rsync -avu --delete', '"'+_ssh.host+':/tmp/'+_ssh.uid+'/"', '"'+opt.userDataDir+'"', '&&',
						'expect', _ssh.auth, _ssh.pass, 'ssh', _ssh.host, '"rm -rf /tmp/'+_ssh.uid+'/"'
					].join(' '), (err, data) => resolve(data.trim())));
				resolve((_ssh = null));
			});
		}) : browser[(browser._process ? 'close' : 'disconnect')]())
	}));
});
