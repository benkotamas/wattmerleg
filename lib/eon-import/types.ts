export type CoverageStatus="complete"|"provisional"|"incomplete"|"invalid";
export type EonInterval={intervalStartUtc:string;localDate:string;importKwh:number;exportKwh:number};
export type EonDayCoverage={localDate:string;expectedIntervalCount:number;rawIntervalCount:number;validNonNullIntervalCount:number;status:CoverageStatus;importSumKwh:number|null;exportSumKwh:number|null;warnings:string[]};
export type EonParseResult={sha256:string;periodStart:string|null;periodEnd:string|null;rawRows:number;validRows:number;invalidRows:number;completeDays:number;provisionalDays:number;incompleteDays:number;importSumKwh:number;exportSumKwh:number;summaryValidation:{totalMatches:boolean;maximumMatches:boolean};days:EonDayCoverage[];intervals:EonInterval[];blockingErrors:string[];warnings:string[]};
