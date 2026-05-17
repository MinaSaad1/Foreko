# Ubiquitous Language

## Data & Ingestion

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Dataset** | A CSV file uploaded by the user that contains one or more time series, stored with metadata (filename, row count, size, upload date). | File, table, source |
| **Column Mapping** | The user-defined assignment of CSV columns to forecasting roles: date, value, and optional series ID. | Schema, config, mapping |
| **Date Parts** | A date composed from separate Year, Month, and optional Day columns when no single datetime column exists. | Split date, composite date |
| **Series extraction** | The operation that converts a Dataset and a Column Mapping into one or more Series objects ready for forecasting. | Parsing, loading |
| **Preview** | A read-only view of a Dataset's column metadata and sample rows before any mapping or extraction is applied. | Sample, inspect |

## Time Series

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Series** | A single named sequence of numeric values ordered by date, derived from a Dataset via Series extraction. | Time series, sequence, signal |
| **Actuals** | The true observed values in a holdout test window, used as the ground truth for metric computation. | Ground truth, labels, observed |
| **History** | All Series values up to (and not including) the test window; used to train or condition a Model. | Training data, context |
| **Frequency** | The inferred time cadence of a Series (e.g., D=daily, W=weekly, MS=month-start, H=hourly). | Granularity, interval, period |
| **Seasonal period** | The detected cycle length of a Series (e.g., 7 for weekly seasonality within daily data). | Period, seasonality, cycle length |

## Forecasting

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Forecast** | The Model's predicted values for future time steps beyond the end of the History. | Prediction, projection, estimate |
| **Horizon** | The number of future periods a Forecast covers (e.g., horizon=12 means 12 steps ahead). | Depth, lookahead, window |
| **Quantile** | A percentile-level bound on a Forecast (p10, p50, p90); p50 is the point forecast. | Band, percentile |
| **Prediction interval** | The range [p10, p90] that expresses forecast uncertainty around the point forecast. | Confidence band, error band, PI |
| **Confidence** | A categorical assessment of Forecast reliability (High, Medium, Low) derived from diagnostics. | Score, level, quality |
| **Calibration** | The measurement of whether a Model's prediction intervals contain the expected fraction of Actuals. | PI coverage, reliability assessment |

## Model Evaluation

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Model** | A forecasting algorithm identified by name (e.g., `timesfm`, `lightgbm`, `arima`, `prophet`). | Algorithm, engine, method |
| **Backtest** | An expanding-window cross-validation procedure that measures Model accuracy on sequential holdout Folds. | Walk-forward, cross-validation, CV |
| **Fold** | A single train/test split within a Backtest, defined by a train-end index and a test window of Horizon length. | Split, iteration, window |
| **Train window** | The slice of History used to fit a Model within a single Fold. | Training period, lookback |
| **Test window** | The Horizon-length holdout slice within a Fold against which Forecast values are compared to Actuals. | Holdout, evaluation period |
| **Winner** | The Model with the lowest mean MAPE across all Folds of a Backtest. | Best model, champion |
| **Lift** | The percentage improvement in MAPE of the Winner over the second-best Model. | Gain, improvement |
| **Reliability table** | The per-quantile comparison of nominal coverage vs. empirical coverage, produced by Calibration. | Coverage table |
| **Miscalibration** | The mean absolute gap between nominal and empirical coverage across all quantiles. | Coverage error, calibration error |

## Jobs & Progress

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Job** | An asynchronous server-side operation (e.g., Backtest, Calibration) tracked by a unique ID with a status. | Task, process, request |
| **Job status** | One of four terminal or active states: `running`, `done`, `error`, `cancelled`. | State, phase |
| **Progress** | Real-time count of completed steps vs. total steps within a running Job, delivered via Event stream. | Status update, heartbeat |
| **Event stream** | A server-sent events (SSE) channel that pushes Progress and state updates to the client during a Job. | SSE, stream, push |
| **Cancel** | A user-initiated signal that requests a running Job to stop before completion. | Abort, stop, kill |

## Infrastructure

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Device** | The compute hardware available for Model inference, either a CUDA GPU or a CPU fallback. | Hardware, accelerator, compute |
| **Model status** | The loading state of the TimesFM model weights (`loading`, `ready`, or `error`). | Model state, initialization state |

## Metrics

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **MAPE** | Mean Absolute Percentage Error; the primary ranking metric used to select the Winner. | Error, accuracy |
| **sMAPE** | Symmetric MAPE; treats over-forecasts and under-forecasts symmetrically. | Symmetric error |
| **RMSE** | Root Mean Squared Error; penalizes large errors more heavily than MAPE. | RMS error |
| **MAE** | Mean Absolute Error; expressed in the original Series units. | Absolute error |
| **MASE** | Mean Absolute Scaled Error; normalised against a seasonal naive baseline. | Scaled error |
| **Pinball loss** | Quantile loss at a specific level (p10, p50, p90); the metric used to evaluate Calibration. | Quantile loss |
| **Per-horizon MAPE** | MAPE computed separately for each step within the Horizon, showing how accuracy degrades with depth. | Horizon breakdown |

## Relationships

- A **Dataset** contains one or more **Series** after **Series extraction** using a **Column Mapping**.
- A **Backtest** is run against one **Series** and one or more **Models** over a fixed number of **Folds**.
- Each **Fold** contains exactly one **Train window** and one **Test window** whose length equals the **Horizon**.
- The **Winner** is selected by comparing each **Model**'s mean **MAPE** across all **Folds**.
- A **Calibration** run follows a **Backtest** and produces a **Reliability table** and a **Miscalibration** score.
- A **Job** encapsulates a **Backtest** or **Calibration** and emits **Progress** via an **Event stream**.
- A **Forecast** is produced by a **Model** conditioned on **History** and predicts **Horizon** steps ahead, expressed as a point value (p50) plus **Prediction intervals** (p10, p90).

## Example dialogue

> **Dev:** "When the user clicks 'Run backtest', do we use all the Series in the Dataset?"

> **Domain expert:** "No — by the time they reach that screen, they've already done Series extraction using a Column Mapping. The backtest runs on exactly one Series at a time. If the Dataset has 50 Series, they pick one, map the columns, and then kick off the Job."

> **Dev:** "So the Job wraps the whole Backtest — all Folds, all Models?"

> **Domain expert:** "Yes. The Job emits Progress events for each Fold/Model combination. Once every Fold is done, the Job settles to 'done' and we compute the Winner from mean MAPE across Folds."

> **Dev:** "And Calibration — is that a separate Job or part of the Backtest Job?"

> **Domain expert:** "Separate. Calibration reads the Fold results already stored by the Backtest Job, computes the Reliability table, and returns the Miscalibration score synchronously. It doesn't need its own Job because it's fast."

## Flagged ambiguities

- **"Window"** is overloaded: it appears as "Train window" (History slice), "Test window" (holdout slice), "context window" (max lookback for the Model), and "window size" (a tuning parameter). Use the qualified compound form in all cases — never bare "window".
- **"Model"** is used in two senses: as an algorithm name string (`"timesfm"`) and as the loaded inference object on the server. In domain conversations, **Model** means the algorithm; the loaded object is an implementation detail and should not appear in domain language.
- **"Metric"** is used for both per-Fold values (raw numbers per split) and aggregated values (mean/std across Folds). Prefer **"per-fold metric"** and **"aggregate metric"** when the distinction matters to avoid confusion.
- **"Period"** was used to mean both Frequency (time cadence) and Seasonal period (cycle length). These are distinct: Frequency is the gap between consecutive observations; Seasonal period is how many observations make one seasonal cycle. Use **Frequency** and **Seasonal period** exclusively.
- **"Forecast"** is used as both a verb (to forecast) and a noun (the Forecast output). This is acceptable in English but watch for ambiguity in API naming: endpoint names should use the noun form (`/forecast` returns a Forecast object, not "to forecast").
