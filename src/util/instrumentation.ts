/*instrumentation.ts*/
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ConsoleSpanExporter,
  ReadableSpan,
  SpanExporter,
} from "@opentelemetry/sdk-trace-node";
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMicroseconds,
} from "@opentelemetry/core";
import { mkdirSync, writeFileSync } from "fs";

//import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
//diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

export class FileSpanExporter implements SpanExporter {
  private _fileCount: number;
  private _spanCount: number;

  constructor(private readonly _path: string) {
    this._path = _path;
    this._fileCount = 0;
    this._spanCount = 0;
    mkdirSync(this._path, { recursive: true });
  }

  /**
   * Export spans.
   * @param spans
   * @param resultCallback
   */
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    return this._saveSpans(spans, resultCallback);
  }

  /**
   * Shutdown the exporter.
   */
  shutdown(): Promise<void> {
    this._saveSpans([]);
    return this.forceFlush();
  }

  /**
   * Exports any pending spans in exporter
   */
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * converts span info into more readable format
   * @param span
   */
  private _exportInfo(span: ReadableSpan) {
    return {
      /*resource: {
        attributes: span.resource.attributes,
      },*/
      //instrumentationScope: span.instrumentationLibrary,
      traceId: span.spanContext().traceId,
      parentId: span.parentSpanId,
      traceState: span.spanContext().traceState?.serialize(),
      name: span.name,
      id: span.spanContext().spanId,
      kind: span.kind,
      timestamp: hrTimeToMicroseconds(span.startTime),
      duration: hrTimeToMicroseconds(span.duration),
      attributes: span.attributes,
      status: span.status,
      //events: span.events,
      //links: span.links,
    };
  }

  /**
   * Showing spans in console
   * @param spans
   * @param done
   */
  private _saveSpans(
    spans: ReadableSpan[],
    done?: (result: ExportResult) => void
  ): void {
    for (const span of spans) {
      //console.dir(this._exportInfo(span), { depth: 3 });
      writeFileSync(
        `${this._path}/span-${this._fileCount}.json`,
        JSON.stringify(this._exportInfo(span)) + "\n",
        { flag: "a" }
      );
      this._spanCount++;
    }
    if (this._spanCount > 10000) {
      this._fileCount++;
      this._spanCount = 0;
    }
    if (done) {
      return done({ code: ExportResultCode.SUCCESS });
    }
  }
}

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "xtratiler",
    [ATTR_SERVICE_VERSION]: "0.9.9",
  }),
  /*traceExporter: new ConsoleSpanExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
    }),*/
  /*traceExporter: new OTLPTraceExporter({
      url: "http://localhost:4318/v1/traces",
      headers: {},
    }),*/
  traceExporter: new FileSpanExporter(
    `/Users/az/development/configs-ldproxy/bb-lika/log/perjob-l-c8-${Date.now()}`
  ),
  /*metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: "http://localhost:4318/v1/metrics", // url is optional and can be omitted - default is http://localhost:4318/v1/metrics
        headers: {}, // an optional object containing custom headers to be sent with each request
      }),
    }),*/
});

sdk.start();

//readTile X10 avg: 1 - 1836.1, 8 - 237765.84

//readTile X2306 avg: 8 - 8122.4

//hasTile X10 avg: 1 - 660.52, 8 - 1442.47

//hasTile X579 avg: 8 - 33147.96
