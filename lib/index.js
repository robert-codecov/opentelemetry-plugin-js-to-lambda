"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsToLambdaPlugin = void 0;
const core_1 = require("@opentelemetry/core");
const api_1 = require("@opentelemetry/api");
const shimmer_1 = __importDefault(require("shimmer"));
const VERSION = '^4.0.0';
class JsToLambdaPlugin extends core_1.BasePlugin {
    constructor(moduleName) {
        super('opentelemetry-plugin-js-to-lambda');
        this.moduleName = moduleName;
        this.supportedVersions = [VERSION];
        this.enabled = false;
        // patchParse receives a function (in this case with input string and output string)
        // and outputs a function of the same type. In this case, the returned function has the
        // same functionality as the original, but has been wrapped in a span.
        this.patchParse = (original) => {
            const self = this;
            return function parse(source) {
                const span = self._tracer.startSpan('js-to-lambda', {
                    kind: api_1.SpanKind.CLIENT,
                    // https://github.com/open-telemetry/opentelemetry-specification/tree/master/specification/resource/semantic_conventions#resource-semantic-conventions
                    attributes: {
                        'name': 'js-to-lambda',
                        'namespace': 'js-to-lambda',
                        'instance': undefined,
                        'version': VERSION,
                        'j2l_source': source,
                    },
                });
                return api_1.context.with(api_1.setSpan(api_1.context.active(), span), () => {
                    try {
                        const result = original(source);
                        span.setStatus({ code: api_1.SpanStatusCode.OK });
                        span.setAttribute('j2l_result', result);
                        return result;
                    }
                    catch (e) {
                        span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: e.message });
                        throw e;
                    }
                    finally {
                        span.end();
                    }
                });
            };
        };
    }
    patch() {
        if (!this.enabled) {
            this.enabled = true;
            const proto = this._moduleExports;
            shimmer_1.default.wrap(this._moduleExports, 'parse', this.patchParse);
        }
    }
    unpatch() {
        if (this.enabled) {
            this.enabled = false;
            const proto = this._moduleExports;
            shimmer_1.default.unwrap(proto, 'parse');
        }
    }
}
exports.JsToLambdaPlugin = JsToLambdaPlugin;
JsToLambdaPlugin.COMPONENT = 'js-to-lambda';
