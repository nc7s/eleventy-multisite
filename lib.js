"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSiteConfig = exports.runEleventy = exports.findSites = exports.dbg = exports.logger = exports.DEFAULT_CONFIG = void 0;
const path_1 = require("path");
const glob_1 = require("glob");
const minimatch_1 = __importDefault(require("minimatch"));
const ignore_1 = __importDefault(require("ignore"));
const fs_1 = require("fs");
const debug_1 = __importDefault(require("debug"));
const Eleventy = require('@11ty/eleventy');
const ConsoleLogger = require('@11ty/eleventy/src/Util/ConsoleLogger');
exports.DEFAULT_CONFIG = {
    baseDir: 'sites/',
    outDir: '_out/',
    sites: ['*'],
    includesDir: '_includes/',
    layoutsDir: '_layouts/'
};
// An Eleventy/Util/ConsoleLogger, proxied to add `[multisite] ` before each message.
exports.logger = new Proxy(new ConsoleLogger, {
    get: function (target, prop) {
        if (['log', 'forceLog', 'warn', 'error'].includes(prop)) {
            return function (msg) {
                target[prop](`[multisite] ${msg}`);
            };
        }
        else {
            return target[prop];
        }
    }
});
exports.dbg = (0, debug_1.default)('eleventy-multisite');
/** Find sites in `baseDir` with given `patterns`.
  *
  * @param {Config} config - Global config.
  * @param {string[] | string} patterns - Glob patterns for the sites.
  * @returns {string[]} Site bases relative to `baseDir`.
  */
function findSites(config, patterns) {
    const ignoreFilter = (0, fs_1.existsSync)('.gitignore') ? (() => {
        const ig = (0, ignore_1.default)().add((0, fs_1.readFileSync)('.gitignore').toString());
        return ig.filter.bind(ig);
    })() : (x) => x;
    if (typeof patterns === 'string') {
        patterns = [patterns];
    }
    let results = [];
    for (let pattern of patterns) {
        if (!pattern.endsWith('/')) {
            pattern += '/';
        }
        pattern = (0, path_1.join)(config.baseDir, pattern);
        // For the following line tsc throws this error:
        //
        // ```
        // error TS2345: Argument of type 'string[]' is not assignable to parameter of type 'readonly string[] & string'.
        //   Type 'string[]' is not assignable to type 'string'.
        // ```
        //
        // which is weird, because parameter `ignore` has the type `string | ReadonlyArray<string> | undefined`,
        // which is definitely not `readonly string[] & string`, which looks impossible to get.
        // TODO: get rid of this error
        // @ts-ignore
        for (let base of ignoreFilter((0, glob_1.sync)(pattern, { ignore: config.excludes }))) {
            // Filter out matches under `config.outDir`, `config.includesDir` or `config.layoutsDir`
            if (!(0, path_1.relative)(config.outDir, base).startsWith('..') ||
                config.includesDir && !(0, path_1.relative)(config.includesDir, base).startsWith('..') ||
                config.layoutsDir && !(0, path_1.relative)(config.layoutsDir, base).startsWith('..')) {
                continue;
            }
            results.push((0, path_1.relative)(config.baseDir, base));
        }
    }
    (0, exports.dbg)('findSites baseDir %s patterns %o results %o', config.baseDir, patterns, results);
    return results;
}
exports.findSites = findSites;
/** Run eleventy on a given site.
  *
  * Based on `@11ty/eleventy/cmd.js`, made some changes to suit our need.
  *
  * @param {RunOptions} options
  */
function runEleventy(options) {
    return __awaiter(this, void 0, void 0, function* () {
        (0, exports.dbg)('runEleventy site `%s` run options %o', options.sourceDir, options);
        const eleventy = new Eleventy(options.sourceDir, options.outDir, {
            quietMode: options.quite,
            configPath: options.ignoreGlobal ? options.configPath : options.globalConfigPath,
        });
        if (!options.ignoreGlobal && options.configPath === undefined) {
            const defaultPath = (0, path_1.join)(options.sourceDir, '.eleventy.js');
            if ((0, fs_1.existsSync)(defaultPath)) {
                options.configPath = defaultPath;
            }
        }
        if (!options.ignoreGlobal && options.configPath !== undefined) {
            (0, exports.dbg)('site `%s` apply site config %s', options.sourceDir, options.configPath);
            const siteConfigure = require((0, path_1.join)(process.cwd(), options.configPath));
            siteConfigure(eleventy.eleventyConfig.userConfig);
            // WARNING: Using internal API.
            eleventy.eleventyConfig.hasConfigMerged = false;
            eleventy.eleventyConfig.getConfig();
        }
        eleventy.setPathPrefix(options.pathPrefix);
        eleventy.setDryRun(options.dryRun);
        eleventy.setIncrementalBuild(options.incremental);
        eleventy.setFormats(options.templateFormats);
        yield eleventy.init();
        if (options.watch || options.serve) {
            eleventy.watch()
                .catch((e) => exports.logger.warn(`runEleventy watch error: ${e}`))
                .then(() => {
                if (options.serve) {
                    eleventy.serve(options.port);
                }
                else {
                    exports.logger.forceLog(`Started watching site ${options.sourceDir}`);
                }
            });
        }
        else {
            // TODO: support JSON / ndjson builds
            yield eleventy.executeBuild();
        }
    });
}
exports.runEleventy = runEleventy;
/** Match a `SiteConfig` for a given site, going through glob patterns.
  *
  * @param {Config} config
  * @param {string} site
  * @returns {SiteConfig | undefined}
  *
  */
function matchSiteConfig(config, site) {
    for (let siteSpec of config.sites) {
        const glob = typeof siteSpec === 'string' ? siteSpec : siteSpec[0];
        if ((0, minimatch_1.default)(site, glob)) {
            if (typeof siteSpec === 'string') {
                // string sitespec uses default config
                return;
            }
            else {
                return siteSpec[1];
            }
        }
    }
}
exports.matchSiteConfig = matchSiteConfig;
