export type PageIntroKey =
 | "data"
 | "upload"
 | "datasets"
 | "preflight"
 | "compare"
 | "backtest"
 | "diagnostics"
 | "anomaly"
 | "explain"
 | "covariates"
 | "scenarios"
 | "segments"
 | "operations"
 | "glossary";

export interface PageIntroContent {
 title: string;
 summary: string;
 whenToUse: string;
 businessQuestions: string[];
 relatedTerms?: string[];
}

export const PAGE_INTROS: Record<PageIntroKey, PageIntroContent> = {
 data: {
 title: "Your data, all in one place",
 summary:
 "Upload a file, connect a database, or pick a sample. Re-open anything you've added before to keep working.",
 whenToUse:
 "Whenever you want to start a new analysis, refresh an existing dataset, or clean up files you no longer need.",
 businessQuestions: [
 "What numbers do I want to forecast?",
 "Which dataset was the one I used last time?",
 "Can I try Foreko on a sample before bringing my own data?",
 ],
 relatedTerms: ["preflight", "zero-shot"],
 },
 upload: {
 title: "Start here, bring in your data",
 summary:
 "Drop a CSV with a date column and a numeric value column. We do the rest.",
 whenToUse:
 "Whenever you want to forecast a new metric, sales, demand, traffic, usage, costs, headcount, and so on.",
 businessQuestions: [
 "What numbers do I want to predict?",
 "Do I have at least a few months of history to learn from?",
 "Is the column layout clean enough to map to a date + value?",
 ],
 relatedTerms: ["preflight", "zero-shot"],
 },
 datasets: {
 title: "Your uploaded datasets",
 summary: "All the CSVs you've uploaded in one place, preview, reuse, or delete.",
 whenToUse:
 "Return here to re-run analyses on a dataset without re-uploading, or to clean up old files.",
 businessQuestions: [
 "Which dataset was the one I used last week?",
 "Can I compare two versions of the same metric?",
 "What can I safely delete?",
 ],
 },
 preflight: {
 title: "Is your data forecast-ready?",
 summary:
 "Runs a quick data-quality check before you forecast. Flags missing values, outliers, seasonality, and shape problems.",
 whenToUse:
 "Before trusting any forecast, especially if the data came from a new source or a fresh extract.",
 businessQuestions: [
 "Is my data clean enough to forecast off?",
 "Do I have hidden weekly or yearly patterns?",
 "Are there outliers that could throw the model off?",
 ],
 relatedTerms: ["preflight", "stationarity", "seasonality"],
 },
 compare: {
 title: "Forecast, which model should I trust?",
 summary:
 "Foreko runs two forecasting approaches on your data, backtests both, and highlights the winner.",
 whenToUse:
 "When you want a forward look with a recommended best-fit model, plus an uncertainty range.",
 businessQuestions: [
 "What do my numbers look like next quarter / month / week?",
 "Which forecasting approach fits my data best?",
 "What's the reasonable high/low range, not just a single point estimate?",
 ],
 relatedTerms: ["winner", "horizon", "p10", "p90"],
 },
 backtest: {
 title: "Stress-test the forecast on your own history",
 summary:
 "Replays the forecast on your past data as if you hadn't seen the future, scoring each replay.",
 whenToUse:
 "When stakeholders need evidence that the forecast would have been right before, not just plausible-looking forward.",
 businessQuestions: [
 "How accurate has this forecasting approach been on my real history?",
 "Does accuracy hold up 1 period out, 3 periods out, 12 periods out?",
 "Are the uncertainty bands trustworthy or misleading?",
 ],
 relatedTerms: ["backtest", "fold", "mape", "rmse", "mase", "calibration"],
 },
 diagnostics: {
 title: "Is the model capturing what it should?",
 summary:
 "Looks at what's left over after forecasting, the residuals, and checks for patterns the model missed.",
 whenToUse:
 "When a forecast looks plausible but you want to confirm there's no obvious signal being ignored.",
 businessQuestions: [
 "Is my forecast model leaving information on the table?",
 "Are the error ranges actually bell-curved, or skewed?",
 "Is there leftover weekly/monthly pattern the model didn't learn?",
 ],
 relatedTerms: ["residual", "qq-plot", "autocorrelation", "ljung-box", "stl"],
 },
 anomaly: {
 title: "Flag unusual points in your history",
 summary:
 "Finds dates where your metric moved far from what's normal, and rates how unusual each one is.",
 whenToUse:
 "When something strange shows up on a dashboard and you need to know which points were genuinely outliers.",
 businessQuestions: [
 "Which past dates were truly unusual, not just noisy?",
 "How severe was each one?",
 "Are there clusters of anomalies I should investigate?",
 ],
 relatedTerms: ["z-score", "severity", "changepoint"],
 },
 explain: {
 title: "Explain what moved your numbers",
 summary:
 "Combines multiple anomaly methods, changepoints, and factor analysis to explain why things shifted.",
 whenToUse:
 "When an anomaly or a trend break needs a root-cause story for leadership.",
 businessQuestions: [
 "Why did this metric change on this date?",
 "Which external drivers actually led the change?",
 "Is there evidence this factor predicts the target, or is it just correlation?",
 ],
 relatedTerms: ["changepoint", "lag", "granger", "correlation"],
 },
 covariates: {
 title: "Bring external drivers into the forecast",
 summary:
 "Quantifies how factors like price, promos, weather, or holidays influence the forecast, versus a baseline.",
 whenToUse:
 "When you know something about the world that the model should also know, and want to measure its real impact.",
 businessQuestions: [
 "Does price / promo / weather meaningfully move the forecast?",
 "Which drivers are worth tracking and which are noise?",
 "How much does the forecast change when I add the factors?",
 ],
 relatedTerms: ["factor", "influence", "correlation", "baseline"],
 },
 scenarios: {
 title: "Play out what-if futures",
 summary:
 "Manually set future factor values (flat, ramp, or zeroed out) and see how the forecast responds.",
 whenToUse:
 "When you're deciding between options, price cuts, spend increases, new launches, and want to compare.",
 businessQuestions: [
 "What if I raise price 10% next quarter?",
 "What if marketing ramps from current to 2x over 6 months?",
 "What does the forecast look like without this driver at all?",
 ],
 relatedTerms: ["scenarios", "counterfactual", "factor"],
 },
 segments: {
 title: "Compare your segments side-by-side",
 summary:
 "Forecasts multiple segments at once (regions, products, cohorts) and ranks them on growth and volatility.",
 whenToUse:
 "When you care about which parts of the business are accelerating, plateauing, or most variable.",
 businessQuestions: [
 "Which segments are growing fastest?",
 "Which segments are the most volatile or unpredictable?",
 "Is the overall trend hiding a split between winners and losers?",
 ],
 relatedTerms: ["segment", "trend"],
 },
 operations: {
 title: "Tag the timeline, save what you ran, export the briefing",
 summary:
 "Annotate important dates (launches, promos, incidents), revisit saved analyses without rerunning, and export a PDF snapshot to share.",
 whenToUse:
 "After a forecast or analysis run, when you want to mark known events on the chart or hand the result to someone else.",
 businessQuestions: [
 "What launches or incidents explain a flagged anomaly?",
 "What did last week's backtest say without re-running it?",
 "Can I export this briefing as a PDF for the monthly report?",
 ],
 relatedTerms: ["annotation"],
 },
 glossary: {
 title: "Every term, in plain English",
 summary:
 "A searchable reference of every statistical and forecasting concept Foreko surfaces.",
 whenToUse:
 "Whenever a label on a chart or a metric in a table isn't immediately obvious.",
 businessQuestions: [
 "What does this term actually mean?",
 "How do I interpret this number for a business decision?",
 "Which terms are related and where should I look next?",
 ],
 },
};
