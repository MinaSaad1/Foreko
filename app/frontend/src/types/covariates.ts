import type { ColumnMapping } from"./dataset";
import type { ForecastConfigIn } from"./forecast";

export interface CovariateConfig {
 dynamic_numerical: string[];
 dynamic_categorical: string[];
 static_numerical: string[];
 static_categorical: string[];
 xreg_mode: "additive" | "multiplicative";
}

export interface CovariateForecastRequest {
 dataset_id: string;
 mapping: ColumnMapping;
 covariate_config: CovariateConfig;
 forecast_config?: ForecastConfigIn;
 horizon: number;
 future_dataset_id?: string | null;
 future_mapping?: ColumnMapping | null;
}
