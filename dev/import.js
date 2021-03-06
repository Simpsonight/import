/** Dependency loading plugin based on basket.js and rsvp.js
 *
 * @param {Array} modules - Array of modules to be loaded
 * @param {Boolean} setStatus - Wether to set the loading status in the related body attributes or not
 * @param {Number} timeout - Custom loading timeout
 *
 * @return {object} - Promise
 *
 * todo: add facade to add event listeners
 * todo: refactor set loading status
 * todo: refactor getDependencies
 *
 */
;(function (window, undefined) {
	window.import = function (modules, setStatus, timeout) {
		var _ = {
			loading: 0,
			lengthLoading: 0,
			loaded: 0,
			body: document.getElementsByTagName('body'),
			defer: RSVP.defer(),
			loadNow: [],
			loadLater: [],
			viewport: window.innerHeight
		};
		
		_.fireCallbacks = function(callbacks, _this) {
			for (var i = 0, len = callbacks.length; i < len; i += 1) {
				if (callbacks[i].method) {
					// do we have params for the method call?
					if (callbacks[i].param) {
						callbacks[i].method.call(_this, callbacks[i].param);
					} else {
						callbacks[i].method.call(_this);
					}
				}
			}
		};
		
		_.fireEvents = function(events) {
			for (var j = 0, lenEvt = events.length; j < lenEvt; j += 1) {
				event = new CustomEvent(
					events[j].name,
					{
						detail: events[j].data,
						bubbles: true,
						cancelable: true
					}
				);

				document.dispatchEvent(event);
			}	
		};
		
		_.changeLoadingClass = function(_this, errorOccurred) {
			for (var k = 0, lenElmt = _this.length; k < lenElmt; k += 1) {
				if (_this[k].tagName !== 'BODY') {
					_this[k].className = _this[k].className.replace('on-loading', errorOccurred ? 'on-loading-error' : '');
				}
			}	
		};

		_.finishModuleLoading = function (mod, errorOccurred) {
			var event,
				_this;

			if (!mod.isBool) {
				_this = mod.condition;
			}

			// fire the callback(s) and assign this to it
			if (mod.callback && !errorOccurred) {
				_.fireCallbacks(mod.callback, _this);
			}

			// fire custom event(s) when module is available
			if (mod.event && mod.event.length && !errorOccurred) {
				_.fireEvents(mod.event);
			}

			if (!mod.isBool) {
				_.changeLoadingClass(_this, errorOccurred);
			}
		};
		
		_.moduleLoadingDone = function(eventName, status, errorOccurred) {
			event = new CustomEvent(
				eventName,
				{
					bubbles: true,
					cancelable: true
				}
			);

			document.dispatchEvent(event);

			_.loaded += 1;
			_.loading -= 1;
			
			modules.shift();
			
			if(modules[0] !== undefined) {
				setTimeout(function() {
					_.getDependencies(modules);
				}, 1000);
				
				if (setStatus) {
					_.setStatus(null, status, errorOccurred);
				}
			}
		};

		/** Recursively loads all dependencies and fires the callback
		 * when all dependencies have been loaded
		 *
		 * @param {Object} module
		 */
		_.getDependencies = function (modules) {
			var mod = modules[0],
				basketOptions = {},
				event,
				promise;
				
			// todo shouldnt be located here
			_.body[0].dataset.module = mod.name ? mod.name : 'anonymous module';

			// all modules loaded?
			if (mod.fetch.length === 0) {
				_.finishModuleLoading(mod);

				_.moduleLoadingDone('on-module-loaded', mod.order);
				
				return;
			} else {
				// for the party people load it from the localstorage
				basketOptions.url = mod.fetch[0];

				if (mod.unique) {
					basketOptions.unique = mod.unique;
				}

				promise = basket.require(basketOptions);
			}

			// Load the next dependency
			promise.then(function () {
				mod.fetch.shift();

				_.getDependencies(modules);
			}, function () {
				// uh oh, an error occured while loading (silence is golden)
				// todo proceed, don't just quit here
				_.finishModuleLoading(mod, true);
				_.moduleLoadingDone('on-loading-error', mod.order, true);
			});
		};

		_.processModules = function () {
			var promise = new RSVP.Promise(function (resolve) {
				var module;

				for (var i = 0, len = modules.length; i < len; i += 1) {
					module = modules[i];

					module.isBool = true;
					module.exists = false;

					if (typeof module.condition === 'string' && module.condition) {
						module.condition = document.querySelectorAll(module.condition);
						module.exists = !!module.condition.length;
						module.isBool = false;
					} else {
						module.exists = !!module.condition;
					}

					if (module.exists) {
						if(module.order === undefined) {
							if (!module.isBool) {
								module.order = Math.floor(module.condition[0].offsetTop);
							} else {
								module.order = _.viewport;
							}
						}

						_.loadNow.push(module);
					} else {
						// todo: Object observer
						_.loadLater.push(module)
					}

					if (i === len - 1) {
						resolve(_.loadNow);
					}
				}
			});

			return promise;
		};

		/** Sorts all modules by order property
		 *
		 * @returns {Object} - Promise
		 */
		_.sortModules = function (modules) {
			var promise = new RSVP.Promise(function(resolve) {
				modules.sort(function (a, b) {
					return a.order - b.order;
				});

				resolve(modules);
			});

			return promise;
		};

		_.getPercent = function (status) {
			var temp;

			// get loading status
			status = status ? status : Math.floor(_.loaded * 100 / _.lengthLoading);

			// we only want percent in tens steps
			if (status > 10 && status < 100) {
				status = '' + status;
				temp = status.split('');

				if (temp[1] <= 5) {
					temp[1] = 0;
				} else {
					temp[0] = parseInt(temp[0], 10) + 1;
					temp[1] = 0;
				}

				status = temp.join('');
			} else if (status > 0 && status <= 10) {
				status = 10;
			}

			return status;
		};

		/** Sets the loading status by adding classes and attributes to the body element
		 * todo refactor
		 */
		_.setStatus = function (status, order, errorOccurred) {
			var event;

			status = _.getPercent(status);

			// set initial and all following loading states
			_.body[0].dataset.status = status;
			_.body[0].dataset.loading = _.lengthLoading;
			_.body[0].dataset.loaded = _.loaded;
			_.body[0].className = _.body[0].className.replace(/on-loading-(\d){1,3}/g, 'on-loading-' + status);
			
			if(order && 
				order >= _.viewport && 
				!/on\-loaded\-atf/ig.test(_.body[0].className)) {
				_.body[0].className += ' on-loaded-atf'; // above the fold
			}

			// set final loading state and fire event when done
			setTimeout(function () {
				if (parseInt(status, 10) === 100) {
					_.body[0].className = _.body[0].className.replace('on-loading ', '');
					_.body[0].className = _.body[0].className.replace('on-loading-100', 'on-loading-done');

					setTimeout(function () {
						_.body[0].className = _.body[0].className.replace('on-loading-done', '');
						_.body[0].className += (_.body[0].className ? ' ' : '') + 'on-loading-complete';

						event = new CustomEvent(
							'on-loading-done',
							{
								bubbles: true,
								cancelable: true
							}
						);

						document.dispatchEvent(event);

						_.defer.resolve();
					}, 100);
				}
			}, 50);
		};

		/** Self explanatory
		 *
		 */
		_.setLoadingValues = function () {
			_.loading = modules.length - 1;
			_.lengthLoading = modules.length - 1;
			_.loaded = 0;

			_.body[0].className += (_.body[0].className ? ' ' : '') + 'on-loading on-loading-0';
			_.body[0].dataset.loading = _.lengthLoading;
			_.body[0].dataset.loaded = _.loaded;
		};

		/** Initialize the module loading
		 *
		 */
		_.initLoading = function (modules) {
			// todo check also for length of modules.fetch
			var nothingToLoad = !modules.length;

			if (setStatus) {
				_.setLoadingValues();
				_.setStatus(nothingToLoad ? 100 : false);
			}

			if(!nothingToLoad) {
				for (var i = 0, len = modules.length; i < len; i += 1) {
					if(!modules[i].isBool) {
						for (var j = 0, lenElements = modules[i].condition.length; j < lenElements; j += 1) {
							if (modules[i].condition[j].tagName !== 'BODY') {
								modules[i].condition[j].className += ' on-loading';
							}
						}
					}
				}
			}
			
			_.getDependencies(modules);
		};

		/** Constructor
		 *
		 */
		_.init = function () {
			if (timeout) {
				basket.timeout = timeout;
			}

			_.processModules()
				.then(_.sortModules)
				.then(_.initLoading);
		};

		_.init();

		return _.defer.promise;
	};
})(window);