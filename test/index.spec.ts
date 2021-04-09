import { SpanStatusCode, context, setSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { InMemorySpanExporter, ReadableSpan, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

import { JsToLambdaPlugin } from '../lib';
import jsToLambda from 'js-to-lambda';

const plugin = new JsToLambdaPlugin(JsToLambdaPlugin.COMPONENT);

describe('JsToLambdaPlugin', () => {
    let contextManager: AsyncHooksContextManager;

    const provider = new NodeTracerProvider();
    const memoryExporter = new InMemorySpanExporter();

    beforeAll(() => {
        // ** when creating the provider, we pass along a simple span processor,
        //    although we'd use something more useful in a real application.
        provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    });

    beforeEach(() => {
        contextManager = new AsyncHooksContextManager().enable();
        context.setGlobalContextManager(contextManager);

        // ** when enabling the plugin, pass along the provider. This is because
        //    from within the plugin itself, we need access to mechanism that provides
        //    traces & can process them.
        plugin.enable(jsToLambda, provider);
    });

    afterEach(() => {
        context.disable();
        memoryExporter.reset();
        plugin.disable();
    });

    // simple configuration checks
    // I'm actually not sure the NodeTracerProvider needs a pre-instantiated
    // plugin, but not really important either.
    describe('js-to-lambda plugin instance', () => {

        it('should export a plugin', () => {
            expect(plugin).toBeInstanceOf(JsToLambdaPlugin);
        });

        it('should have correct moduleName', () => {
            expect(plugin.moduleName).toBe('js-to-lambda');
        });
    });

    describe('js-to-lambda parse operation', () => {
        it('should patch jsToLambda.parse', () => {
            const span = provider.getTracer('default').startSpan('test span');
            
            context.with(setSpan(context.active(), span), () => {
                
                const original = 'function outer(a, b) { return b; };';
                const output = jsToLambda.parse(original);

                // check that parse still returns correct values
                expect(output).toBe('λa.λb.b');
            
                // check resulting span
                const spans = memoryExporter.getFinishedSpans();
                expect(spans).toHaveLength(1);
                const span = spans[0];

                expect(span.attributes).toStrictEqual({
                    "j2l_result": "λa.λb.b",
                    "j2l_source": "function outer(a, b) { return b; };",
                    "name": "js-to-lambda",
                    "namespace": "js-to-lambda",
                    "version": "^4.0.0"
                });
            });
        });
    });
});