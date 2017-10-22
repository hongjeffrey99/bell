const async = require('async');
const _ = require('lodash');
const $ = require('jquery');
const Visibility = require('visibilityjs');
const BellTimer = require('./BellTimer.js');
const SimpleLogger = require('./SimpleLogger.js');
const CookieManager = require('./CookieManager2.js');
const RequestManager = require('./RequestManager');
const ThemeManager = require('./ThemeManager.js');
const AnalyticsManager = require('./AnalyticsManager.js');
const UIManager = require('./UIManager.js');
const IntervalManager = require('./IntervalManager.js');
const ChromeExtensionMessenger = require('./ChromeExtensionMessenger');

var logger = new SimpleLogger();
logger.setLevel('info');
// var cookieManager = new CookieManager(Cookies);
var cookieManager = new CookieManager();
var requestManager = new RequestManager(cookieManager);
var themeManager = new ThemeManager(cookieManager);
var analyticsManager = new AnalyticsManager(cookieManager, themeManager, logger);
var bellTimer = new BellTimer(cookieManager, requestManager);
var uiManager = new UIManager(bellTimer, cookieManager, themeManager, analyticsManager, requestManager);
var chromeExtensionMessenger = new ChromeExtensionMessenger(cookieManager);

var intervals = {
    fast: {
        start: function(func, callback) {
            callback(setInterval(func, 1000 / 30));
        },
        func: uiManager.updateGraphics
    },
    oneSecond: {
        start: function(func, callback) {
            setTimeout(function() {
                func();
                callback(setInterval(function() {
                    func();

                    // This function should be called every second, on the second.
                    // Detect if it is more than 100 ms off, and if so, restart interval.
                    var waitUntilNextTick = bellTimer.getWaitUntilNextTick();
                    var offset = Math.min(waitUntilNextTick, 1000 - waitUntilNextTick);
                    if (offset > 100 && (Visibility.state() == 'visible')) {
                        logger.debug('Tick offset was ' + offset + ' ms, restarting interval...');
                        intervalManager.restart('oneSecond');
                    }
                }, 1000));
            }, 1000 - bellTimer.getWaitUntilNextTick());
        },
        func: uiManager.update
    },
    background: {
        start: function(func, callback) {
            callback(setInterval(func, 4 * 60 * 1000 /*4 * 60 * 1000*/ ));
        },
        func: function() {
            logger.info('Loading data and synchronizing...');
            bellTimer.reloadData().then(function() {
                logger.success('Bell timer reloaded');
                logger.info('Synchronization correction: ' + bellTimer.bellCompensation);
                intervalManager.restart('oneSecond');
            });
            uiManager.loadPopup();
        }
    }
};
var intervalManager = new IntervalManager(intervals);
bellTimer.setDebugLogFunction(logger.debug);

global.bellTimer = bellTimer;
global.logger = logger;
global.cookieManager = cookieManager;
global.$ = $;
global.requestManager = requestManager;

logger.info('Type `logger.setLevel(\'debug\')` to enable debug logging');

// bellTimer.enableDevMode(new Date('2017-05-23 8:00'), 60);

$(window).on('load', async function() {

    logger.info('Loading data...');
    uiManager.setLoadingMessage('Loading');
    await bellTimer.initialize();

    logger.info('Synchronizing...');
    uiManager.setLoadingMessage('Synchronizing');
    await bellTimer.initializeTimesync();
    logger.success('Bell timer initialized');
    uiManager.hideLoading();

    await uiManager.initialize();
    uiManager.update();
    logger.success('UI initialized and updated');

    analyticsManager.reportAnalytics();

    intervalManager.startAll();
    logger.success('Ready!');
});