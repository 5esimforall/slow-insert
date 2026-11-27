import type {
  CanonicalUuidInput,
  TruesightApi,
  TruesightCatalogApi,
  TruesightNamesApi,
  TruesightSourcesApi
} from "../../../truesight/types/api-v1.d.ts";

export declare const apiVersion: 1;
export declare const GROUP_INDEX_FIELDS: readonly string[];
export declare function canonicalUuid(item: CanonicalUuidInput): string;
export declare const catalog: TruesightCatalogApi;
export declare const names: TruesightNamesApi;
export declare const sources: TruesightSourcesApi;
export declare const api: TruesightApi;
