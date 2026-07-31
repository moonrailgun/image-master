# Tool Analytics Design

## Goal

Add a consistent Tianji event funnel across all nine image tools so product
usage can be measured from image import through processing and download.

The instrumentation must not collect image contents, filenames, raw error
messages, or other user-provided data. Analytics failures must never interrupt
image processing.

## Scope

Instrument these tools:

- Background remover
- Sprite splitter
- Super resolution
- Image resizer
- Image compressor
- Image transform
- Image inpainting
- Image cropper
- Image vectorizer

The first version covers only the core funnel:

1. Import images
2. Start processing
3. Finish or fail processing
4. Download output

Homepage navigation, parameter changes, preview interactions, and other
secondary actions are out of scope.

## Architecture

Create a small client-side analytics module that owns the Tianji integration
and the event contract. Tool components call this module instead of reading
`window.tianji` directly.

The module will:

- Define the supported tool keys, event names, and payload types.
- Call `window.tianji.track(eventName, payload)` when the tracker is available.
- Return without throwing when rendered on the server, before the tracker has
  loaded, or when Tianji tracking is disabled.
- Normalize failure details into a controlled error category rather than
  sending raw exception text.

The existing `ImageDropzone` will report how files entered the tool by passing
an import source alongside the selected files. The supported sources are file
picker, drag and drop, and clipboard paste. Files sent between tools will be
recorded as a transfer import at the receiving tool.

Each tool component will record processing events at the actual business
boundaries:

- Start immediately before processing begins.
- Success only after usable output has been created.
- Failure from the existing error path.
- Download when the browser download is initiated, or after ZIP creation
  succeeds for a batch download.

## Event Contract

### `tool_import`

Recorded once for each accepted import operation.

| Field | Type | Description |
| --- | --- | --- |
| `tool` | string | Stable tool key |
| `source` | `picker`, `drop`, `paste`, or `transfer` | Import mechanism |
| `file_count` | number | Number of accepted files |

### `tool_process_start`

Recorded once when a processing run begins.

| Field | Type | Description |
| --- | --- | --- |
| `tool` | string | Stable tool key |
| `file_count` | number | Number of input files in the run |

### `tool_process_success`

Recorded once when a processing run creates usable output.

| Field | Type | Description |
| --- | --- | --- |
| `tool` | string | Stable tool key |
| `file_count` | number | Number of input files in the run |
| `processed_count` | number | Number of input files that produced usable output |
| `duration_ms` | number | Processing wall-clock duration in milliseconds |

For batch tools that can partially succeed, the run is successful when at
least one usable output exists. Individual failed files are reflected by
`processed_count < file_count`; no extra per-file failure events are emitted.

### `tool_process_failure`

Recorded once when a processing run produces no usable output.

| Field | Type | Description |
| --- | --- | --- |
| `tool` | string | Stable tool key |
| `file_count` | number | Number of input files in the run |
| `duration_ms` | number | Processing wall-clock duration in milliseconds |
| `error_type` | string | Controlled error category |

The initial error categories are:

- `validation`
- `model_download`
- `processing`
- `memory`
- `unknown`

The classifier may use known exception types or messages locally, but it must
only send one of these categories to Tianji.

### `tool_download`

Recorded once for each user-initiated download.

| Field | Type | Description |
| --- | --- | --- |
| `tool` | string | Stable tool key |
| `output_count` | number | Number of outputs included |
| `format` | `single` or `zip` | Download packaging |

A single-file event means the browser download was initiated. A ZIP event is
recorded only after ZIP generation succeeds and the browser download is
initiated.

## Timing

Use `performance.now()` around each processing run and round the difference to
an integer. This measures elapsed wall-clock time as experienced by the user.
Import preparation and download time are not included.

## Privacy and Reliability

Allowed fields are limited to the event contract above. Do not report:

- Filenames or paths
- MIME types or image dimensions
- Image bytes, prompts, masks, or other content
- Raw exception names, messages, or stack traces
- Stable user identifiers

Analytics calls are best effort. Missing Tianji, blocked requests, Do Not
Track, or `tianji.disabled` must not change visible application behavior.

## Testing

Add focused unit tests for the analytics module before implementation:

- It forwards an event and payload when `window.tianji.track` exists.
- It does not throw when rendered without `window`.
- It does not throw when the tracker script has not loaded.
- It maps failures to the controlled error categories without exposing raw
  error text.
- It calculates and rounds processing duration from supplied timestamps.

Add focused tests for import-source propagation where practical. Then run:

- The new analytics tests.
- The existing test suite.
- Focused ESLint for every changed source file.
- A production Next.js build.

The repository currently has unrelated full-project ESLint failures. They are
not part of this work; verification must report them separately if they remain.

## Success Criteria

- All nine tools emit the same core funnel with stable field names.
- Processing success and failure represent actual output state, including
  partial batch success.
- Downloads are not counted before they are initiated.
- No private image or error content is sent.
- The application behaves normally when Tianji is unavailable.
