import { BasePlugin } from '@opentelemetry/core';
import { Span, SpanKind, SpanStatusCode, context, setSpan } from '@opentelemetry/api';
import shimmer from 'shimmer';
import type jsToLambda from 'js-to-lambda';

const VERSION = '^4.0.0';

export class JsToLambdaPlugin extends BasePlugin<typeof jsToLambda> {
    public readonly supportedVersions = [VERSION];
    public static readonly COMPONENT = 'js-to-lambda';

    private enabled = false;

    public constructor(public readonly moduleName: string) {
        super('opentelemetry-plugin-js-to-lambda');
    }

    protected patch(): typeof jsToLambda {
        if (!this.enabled) {
            this.enabled = true;
            
            const proto = this._moduleExports;
            shimmer.wrap(this._moduleExports, 'parse', this.patchParse);
        }
    }

    protected unpatch(): void {
        if (this.enabled) {
            this.enabled = false;
            
            const proto = this._moduleExports;
            shimmer.unwrap(proto, 'parse');
        }
    }

    // patchParse receives a function (in this case with input string and output string)
    // and outputs a function of the same type. In this case, the returned function has the
    // same functionality as the original, but has been wrapped in a span.
    private readonly patchParse = (original: (source: string) => string): typeof original => {
        const self = this;
        
        return function parse(source: string): string {
            const span = self._tracer.startSpan('js-to-lambda', {
                kind: SpanKind.CLIENT,

                // https://github.com/open-telemetry/opentelemetry-specification/tree/master/specification/resource/semantic_conventions#resource-semantic-conventions
                attributes: {
                    'name': 'js-to-lambda',
                    'namespace': 'js-to-lambda',
                    'instance': undefined,
                    'version': VERSION,

                    'j2l_source': source,
                },
            });

            return context.with(setSpan(context.active(), span), () => {
                try {
                    const result = original(source);
                    span.setStatus({ code: SpanStatusCode.OK });
                    span.setAttribute('j2l_result', result);
                    return result;
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
                    throw e;
                } finally {
                    span.end();
                }
            }) as ReturnType<typeof original>;
        };
    };
}
