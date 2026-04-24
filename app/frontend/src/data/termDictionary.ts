export type TermCategory =
  | "accuracy"
  | "uncertainty"
  | "anomaly"
  | "diagnostics"
  | "backtest"
  | "factors"
  | "comparison"
  | "scenarios"
  | "data-quality"
  | "ops";

export interface TermDefinition {
  key: string;
  label: string;
  aliases?: string[];
  category: TermCategory;
  shortDefinition: string;
  businessAngle: string;
  example?: string;
  relatedTerms?: string[];
}

export const TERM_CATEGORIES: Record<TermCategory, { label: string; blurb: string }> = {
  accuracy: {
    label: "Accuracy metrics",
    blurb: "How close our forecasts are to what actually happened.",
  },
  uncertainty: {
    label: "Uncertainty & ranges",
    blurb: "How wide the forecast could reasonably land.",
  },
  anomaly: {
    label: "Anomaly detection",
    blurb: "Finding unusual points and changes in your data.",
  },
  diagnostics: {
    label: "Diagnostics",
    blurb: "Signals about whether the model is capturing your data well.",
  },
  backtest: {
    label: "Backtesting & horizons",
    blurb: "Stress-testing the forecast on your own history.",
  },
  factors: {
    label: "Factors & drivers",
    blurb: "External variables that may influence the forecast.",
  },
  comparison: {
    label: "Model comparison",
    blurb: "Picking between competing forecasting approaches.",
  },
  scenarios: {
    label: "What-if scenarios",
    blurb: "Simulating alternative futures.",
  },
  "data-quality": {
    label: "Data quality",
    blurb: "Is your data ready to be forecasted?",
  },
  ops: {
    label: "Operations",
    blurb: "Scheduling, alerts, and sharing.",
  },
};

export const TERMS: Record<string, TermDefinition> = {
  mape: {
    key: "mape",
    label: "MAPE",
    aliases: ["mean absolute percentage error"],
    category: "accuracy",
    shortDefinition:
      "Average percentage error between forecasted and actual values.",
    businessAngle:
      "A plain scorecard: 'our forecasts are typically off by this percent'. Lower is better.",
    example: "MAPE of 8% means forecasts are usually about 8% above or below actual.",
    relatedTerms: ["rmse", "mase", "horizon"],
  },
  rmse: {
    key: "rmse",
    label: "RMSE",
    aliases: ["root mean squared error"],
    category: "accuracy",
    shortDefinition:
      "Average size of forecast errors, in the same units as your data.",
    businessAngle:
      "Tells you the typical dollar/unit miss. Penalises big misses more than small ones.",
    relatedTerms: ["mape", "mae"],
  },
  mae: {
    key: "mae",
    label: "MAE",
    aliases: ["mean absolute error"],
    category: "accuracy",
    shortDefinition: "Average absolute distance between forecast and actual.",
    businessAngle:
      "Straight-forward 'average miss' in your units, treating over- and under-forecasts equally.",
    relatedTerms: ["mape", "rmse"],
  },
  smape: {
    key: "smape",
    label: "sMAPE",
    aliases: ["symmetric mape"],
    category: "accuracy",
    shortDefinition:
      "Symmetric percentage error. Handles values near zero better than MAPE.",
    businessAngle:
      "Safer percentage score when actuals can be zero or very small, MAPE can explode there.",
    relatedTerms: ["mape"],
  },
  mase: {
    key: "mase",
    label: "MASE",
    aliases: ["mean absolute scaled error"],
    category: "accuracy",
    shortDefinition:
      "Forecast error compared with a naive 'same as last period' baseline.",
    businessAngle:
      "Below 1.0 means we beat the simple 'repeat last period' rule. Above 1.0 means we did worse.",
    relatedTerms: ["mape", "rmse"],
  },
  "pinball-loss": {
    key: "pinball-loss",
    label: "Pinball loss",
    aliases: ["pinball", "pinball p50", "quantile loss"],
    category: "accuracy",
    shortDefinition:
      "Accuracy score for the uncertainty bands, not just the single best-guess line.",
    businessAngle:
      "Rewards forecasts whose high/low ranges actually cover what happens. Lower is better.",
    relatedTerms: ["p10", "p90", "calibration"],
  },
  p10: {
    key: "p10",
    label: "P10",
    aliases: ["10th percentile", "lower band"],
    category: "uncertainty",
    shortDefinition:
      "A low-end estimate: only about 10% of outcomes should fall below this line.",
    businessAngle:
      "Use P10 as a conservative floor when you're planning for a worst-realistic case.",
    relatedTerms: ["p90", "pinball-loss", "calibration"],
  },
  p90: {
    key: "p90",
    label: "P90",
    aliases: ["90th percentile", "upper band"],
    category: "uncertainty",
    shortDefinition:
      "A high-end estimate: only about 10% of outcomes should land above this line.",
    businessAngle:
      "Use P90 as a stretch ceiling when planning for an optimistic-but-plausible case.",
    relatedTerms: ["p10", "pinball-loss", "calibration"],
  },
  calibration: {
    key: "calibration",
    label: "Calibration",
    aliases: ["prediction-interval calibration", "nominal coverage", "empirical coverage"],
    category: "uncertainty",
    shortDefinition:
      "Do the forecast's uncertainty ranges actually cover reality as often as they claim?",
    businessAngle:
      "If the model says '80% confidence', roughly 80% of actuals should fall inside that band. Otherwise the ranges are misleading.",
    relatedTerms: ["p10", "p90", "pinball-loss"],
  },
  horizon: {
    key: "horizon",
    label: "Horizon",
    aliases: ["forecast horizon"],
    category: "backtest",
    shortDefinition: "How many periods into the future we're forecasting.",
    businessAngle:
      "Short horizons (next week) are usually more accurate than long ones (next quarter).",
    relatedTerms: ["backtest", "fold"],
  },
  backtest: {
    key: "backtest",
    label: "Backtest",
    aliases: ["walk-forward backtest", "walk-forward"],
    category: "backtest",
    shortDefinition:
      "Replay the forecast on your own past data as if you hadn't seen the future.",
    businessAngle:
      "The best evidence you can trust the forecast: 'here's how it would have done on last year's numbers'.",
    relatedTerms: ["fold", "horizon", "mape"],
  },
  fold: {
    key: "fold",
    label: "Fold",
    aliases: ["expanding-window fold"],
    category: "backtest",
    shortDefinition:
      "One slice of the backtest, train on history up to a date, forecast forward, score it, repeat.",
    businessAngle:
      "More folds = more independent 'did it work?' checks. Average across folds is your real accuracy.",
    relatedTerms: ["backtest", "horizon"],
  },
  "z-score": {
    key: "z-score",
    label: "Z-score",
    aliases: ["z score", "3-sigma", "2-sigma"],
    category: "anomaly",
    shortDefinition:
      "How far a point is from the usual, measured in standard deviations.",
    businessAngle:
      "Above 3 = 'very unusual, investigate'. Above 2 = 'worth a look'. Tunable to your risk appetite.",
    relatedTerms: ["severity", "changepoint"],
  },
  severity: {
    key: "severity",
    label: "Severity",
    aliases: ["critical", "warning", "normal"],
    category: "anomaly",
    shortDefinition:
      "How surprising a point is, Critical (very unusual), Warning (worth a look), Normal.",
    businessAngle:
      "A triage label so you focus on the right anomalies first.",
    relatedTerms: ["z-score", "changepoint"],
  },
  changepoint: {
    key: "changepoint",
    label: "Changepoint",
    aliases: ["change point", "structural break"],
    category: "anomaly",
    shortDefinition:
      "A date where the underlying pattern of the data shifts (new trend, new baseline).",
    businessAngle:
      "Flags moments your business behaved differently, launches, promos, policy changes, market shifts.",
    relatedTerms: ["z-score", "drift"],
  },
  residual: {
    key: "residual",
    label: "Residual",
    aliases: ["residuals", "residual analysis"],
    category: "diagnostics",
    shortDefinition: "The leftover gap between what the model predicted and what happened.",
    businessAngle:
      "If residuals look like random noise, the model has learned what it can. If they show patterns, something is missing.",
    relatedTerms: ["autocorrelation", "ljung-box", "qq-plot"],
  },
  "qq-plot": {
    key: "qq-plot",
    label: "Q-Q plot",
    aliases: ["qq plot", "quantile-quantile plot"],
    category: "diagnostics",
    shortDefinition:
      "A chart that shows whether residuals follow a bell-curve distribution.",
    businessAngle:
      "If dots hug the diagonal, errors are well-behaved and uncertainty bands are trustworthy.",
    relatedTerms: ["residual", "calibration"],
  },
  autocorrelation: {
    key: "autocorrelation",
    label: "Autocorrelation",
    aliases: ["acf"],
    category: "diagnostics",
    shortDefinition:
      "Whether today's value is still related to yesterday's, last week's, last month's, etc.",
    businessAngle:
      "Strong autocorrelation means the past predicts the future well; low means the series is closer to noise.",
    relatedTerms: ["residual", "seasonality"],
  },
  "ljung-box": {
    key: "ljung-box",
    label: "Ljung-Box test",
    aliases: ["ljung box"],
    category: "diagnostics",
    shortDefinition:
      "A statistical check: do the residuals still contain pattern the model missed?",
    businessAngle:
      "A healthy result says the forecast has squeezed the predictive signal out of the data.",
    relatedTerms: ["residual", "autocorrelation"],
  },
  stl: {
    key: "stl",
    label: "STL decomposition",
    aliases: ["stl", "seasonal-trend decomposition"],
    category: "diagnostics",
    shortDefinition:
      "Splits a series into long-term trend, repeating seasonal pattern, and leftover noise.",
    businessAngle:
      "Lets you see growth, cycle, and surprise separately, clearer story for stakeholders.",
    relatedTerms: ["seasonality", "trend"],
  },
  seasonality: {
    key: "seasonality",
    label: "Seasonality",
    aliases: ["seasonal", "seasonal pattern"],
    category: "data-quality",
    shortDefinition:
      "A pattern that repeats on a fixed calendar cycle, weekly, monthly, yearly.",
    businessAngle:
      "Recognising seasonality means we can plan around it instead of reacting every time.",
    relatedTerms: ["stl", "stationarity", "trend"],
  },
  trend: {
    key: "trend",
    label: "Trend",
    category: "diagnostics",
    shortDefinition: "The slow, underlying direction the series is moving in.",
    businessAngle:
      "The storyline under the week-to-week noise: growing, shrinking, or flat.",
    relatedTerms: ["stl", "seasonality"],
  },
  stationarity: {
    key: "stationarity",
    label: "Stationarity",
    aliases: ["stationary"],
    category: "data-quality",
    shortDefinition:
      "A series whose average and volatility stay stable over time (no runaway growth or shifting variance).",
    businessAngle:
      "Non-stationary data often needs a transform before forecasting; Foresee's Preflight flags this.",
    relatedTerms: ["seasonality", "trend"],
  },
  drift: {
    key: "drift",
    label: "Drift",
    aliases: ["forecast drift"],
    category: "ops",
    shortDefinition:
      "The model's accuracy slowly degrading because the underlying data has changed.",
    businessAngle:
      "Triggers a refresh or re-training before the forecasts quietly stop being useful.",
    relatedTerms: ["changepoint", "backtest"],
  },
  factor: {
    key: "factor",
    label: "Factor",
    aliases: ["covariate", "external driver", "xreg"],
    category: "factors",
    shortDefinition:
      "An extra input variable (price, weather, promo, holiday) that may influence the forecast.",
    businessAngle:
      "Lets you bring in the things you know about the world, so the forecast isn't just extrapolating the past.",
    relatedTerms: ["influence", "granger", "baseline"],
  },
  influence: {
    key: "influence",
    label: "Influence",
    category: "factors",
    shortDefinition:
      "How strongly a factor moves together with your target metric.",
    businessAngle:
      "Ranks your drivers so you know which levers actually matter.",
    relatedTerms: ["factor", "correlation"],
  },
  correlation: {
    key: "correlation",
    label: "Correlation",
    aliases: ["pearson r"],
    category: "factors",
    shortDefinition:
      "How tightly two series move together on a scale from -1 to +1.",
    businessAngle:
      "+1 means they rise and fall in lockstep, -1 means they move opposite, 0 means unrelated.",
    relatedTerms: ["influence", "lag"],
  },
  lag: {
    key: "lag",
    label: "Lag",
    aliases: ["peak lag", "cross-correlation"],
    category: "factors",
    shortDefinition:
      "How many periods ahead or behind a factor leads the target.",
    businessAngle:
      "If marketing spend leads revenue by 3 weeks, that's a useful planning insight.",
    relatedTerms: ["correlation", "granger"],
  },
  granger: {
    key: "granger",
    label: "Granger causality",
    aliases: ["granger"],
    category: "factors",
    shortDefinition:
      "A statistical test: does knowing factor X's past help predict future target values?",
    businessAngle:
      "Stronger evidence than plain correlation that a factor is actually worth tracking.",
    relatedTerms: ["factor", "lag", "correlation"],
  },
  baseline: {
    key: "baseline",
    label: "Baseline",
    category: "factors",
    shortDefinition:
      "The forecast ignoring extra factors, useful as a comparison point.",
    businessAngle:
      "If adding factors doesn't beat the baseline, those factors aren't earning their keep.",
    relatedTerms: ["factor", "winner"],
  },
  winner: {
    key: "winner",
    label: "Winner",
    aliases: ["alternative", "recommended model"],
    category: "comparison",
    shortDefinition:
      "The forecasting approach that produced the lower error on the backtest.",
    businessAngle:
      "Foresee highlights the model that would have performed best on your history so you know which line to trust.",
    relatedTerms: ["backtest", "mape"],
  },
  counterfactual: {
    key: "counterfactual",
    label: "Counterfactual",
    aliases: ["zero out"],
    category: "scenarios",
    shortDefinition:
      "A 'what would have happened without this factor' scenario.",
    businessAngle:
      "Quantify the contribution of a driver by forecasting with it zeroed out, then comparing.",
    relatedTerms: ["scenarios", "factor"],
  },
  scenarios: {
    key: "scenarios",
    label: "Scenarios",
    aliases: ["what-if", "scenario"],
    category: "scenarios",
    shortDefinition:
      "Hypothetical futures you set manually, 'price -10%', 'ad spend ramp to 2x'.",
    businessAngle:
      "Stress-test decisions before committing resources.",
    relatedTerms: ["counterfactual", "factor"],
  },
  segment: {
    key: "segment",
    label: "Segment",
    aliases: ["cohort", "series id"],
    category: "comparison",
    shortDefinition:
      "A subgroup of the data, region, product, customer tier, forecast and compared side-by-side.",
    businessAngle:
      "See which parts of the business are growing, flat, or volatile without averaging the story away.",
    relatedTerms: ["winner", "trend"],
  },
  preflight: {
    key: "preflight",
    label: "Preflight",
    aliases: ["data quality preflight"],
    category: "data-quality",
    shortDefinition:
      "Data-quality checks that run before forecasting: missing values, outliers, stationarity, seasonality.",
    businessAngle:
      "Catches 'garbage in' problems before they become 'garbage out' forecasts.",
    relatedTerms: ["stationarity", "seasonality"],
  },
  annotation: {
    key: "annotation",
    label: "Annotation",
    category: "ops",
    shortDefinition:
      "A human-readable note pinned to a specific date (launches, promos, outages).",
    businessAngle:
      "Explain anomalies and changepoints to your future self and your team.",
    relatedTerms: ["changepoint"],
  },
  schedule: {
    key: "schedule",
    label: "Schedule",
    aliases: ["cron"],
    category: "ops",
    shortDefinition:
      "A recurring job that refreshes the forecast on a cron expression.",
    businessAngle:
      "Keep a forecast current without anyone having to click 'run' every day.",
    relatedTerms: ["drift"],
  },
  "alert-rule": {
    key: "alert-rule",
    label: "Alert rule",
    aliases: ["alert", "webhook"],
    category: "ops",
    shortDefinition:
      "A condition that, when met, sends a notification to a webhook (Slack, Teams, email gateway).",
    businessAngle:
      "Pull-based dashboards miss things; alerts get the right people moving when it matters.",
    relatedTerms: ["drift", "changepoint"],
  },
  "zero-shot": {
    key: "zero-shot",
    label: "Zero-shot",
    aliases: ["foundation model", "pretrained"],
    category: "comparison",
    shortDefinition:
      "The forecasting model hasn't been trained on your data, it generalises from millions of other series.",
    businessAngle:
      "You get a usable forecast the moment you upload, no training project, no ML team.",
    relatedTerms: ["winner", "backtest"],
  },
};

export type TermKey = keyof typeof TERMS;

export function getTerm(key: string): TermDefinition | undefined {
  return TERMS[key];
}

export function termsByCategory(): Record<TermCategory, TermDefinition[]> {
  const grouped = {} as Record<TermCategory, TermDefinition[]>;
  for (const cat of Object.keys(TERM_CATEGORIES) as TermCategory[]) {
    grouped[cat] = [];
  }
  for (const term of Object.values(TERMS)) {
    grouped[term.category].push(term);
  }
  for (const cat of Object.keys(grouped) as TermCategory[]) {
    grouped[cat].sort((a, b) => a.label.localeCompare(b.label));
  }
  return grouped;
}
