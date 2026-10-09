/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface RootResponseDto {
  /** API display name */
  name: string;
  /** Path to Swagger UI */
  docs: string;
}

export interface PatchNoteDto {
  /** @format uuid */
  id: string;
  /** @example "1.2.3" */
  version: string;
  /** @example "Balance Update" */
  title: string;
  /** @example "Enemy damage reduced by 10%." */
  content: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

export interface CreatePatchNoteDto {
  /**
   * Game version in Major.Minor.Patch format
   * @example "1.2.3"
   */
  version: string;
  /**
   * @minLength 1
   * @example "Balance Update"
   */
  title: string;
  /**
   * @minLength 1
   * @example "Enemy damage reduced by 10%."
   */
  content: string;
}

export interface UpdatePatchNoteDto {
  /**
   * @minLength 1
   * @example "Balance Update"
   */
  title?: string;
  /**
   * @minLength 1
   * @example "Enemy damage reduced by 10%."
   */
  content?: string;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title Shadow Infection Patch Notes API
 * @version 1.0
 * @contact
 *
 * REST API for Shadow Infection patch notes
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  /**
   * No description
   *
   * @tags App
   * @name AppControllerGetRoot
   * @request GET:/
   */
  appControllerGetRoot = (params: RequestParams = {}) =>
    this.request<RootResponseDto, any>({
      path: `/`,
      method: "GET",
      format: "json",
      ...params,
    });

  health = {
    /**
     * No description
     *
     * @tags Health
     * @name HealthControllerCheck
     * @request GET:/health
     */
    healthControllerCheck: (params: RequestParams = {}) =>
      this.request<
        {
          /** @example "ok" */
          status?: "ok" | "degraded";
          /** @example {"database":{"status":"up","responseTime":12}} */
          info?: Record<
            string,
            {
              status: "up" | "degraded" | "down";
              /** Time the health indicator took to respond, in ms */
              responseTime?: number;
              [key: string]: any;
            }
          > | null;
          /** @example {} */
          error?: Record<
            string,
            {
              status: "up" | "degraded" | "down";
              /** Time the health indicator took to respond, in ms */
              responseTime?: number;
              [key: string]: any;
            }
          > | null;
          /** @example {"database":{"status":"up","responseTime":12}} */
          details?: Record<
            string,
            {
              status: "up" | "degraded" | "down";
              /** Time the health indicator took to respond, in ms */
              responseTime?: number;
              [key: string]: any;
            }
          >;
        },
        {
          /** @example "error" */
          status?: "error" | "shutting_down";
          /** @example {"database":{"status":"up","responseTime":12}} */
          info?: Record<
            string,
            {
              status: "up" | "degraded" | "down";
              /** Time the health indicator took to respond, in ms */
              responseTime?: number;
              [key: string]: any;
            }
          > | null;
          /** @example {"redis":{"status":"down","message":"Could not connect","responseTime":3005}} */
          error?: Record<
            string,
            {
              status: "up" | "degraded" | "down";
              /** Time the health indicator took to respond, in ms */
              responseTime?: number;
              [key: string]: any;
            }
          > | null;
          /** @example {"database":{"status":"up","responseTime":12},"redis":{"status":"down","message":"Could not connect","responseTime":3005}} */
          details?: Record<
            string,
            {
              status: "up" | "degraded" | "down";
              /** Time the health indicator took to respond, in ms */
              responseTime?: number;
              [key: string]: any;
            }
          >;
        }
      >({
        path: `/health`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
  patchNotes = {
    /**
     * @description Returns all notes, or at most one note when filtered by version.
     *
     * @tags Patch Notes
     * @name PatchNotesControllerFindAll
     * @summary List patch notes
     * @request GET:/patch-notes
     */
    patchNotesControllerFindAll: (
      query?: {
        /**
         * Filter by game version (Major.Minor.Patch). At most one note.
         * @example "1.2.3"
         */
        version?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<PatchNoteDto[], any>({
        path: `/patch-notes`,
        method: "GET",
        query: query,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Patch Notes
     * @name PatchNotesControllerCreate
     * @summary Create a patch note
     * @request POST:/patch-notes
     * @secure
     */
    patchNotesControllerCreate: (
      data: CreatePatchNoteDto,
      params: RequestParams = {},
    ) =>
      this.request<PatchNoteDto, void>({
        path: `/patch-notes`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Patch Notes
     * @name PatchNotesControllerFindOne
     * @summary Get one patch note by id
     * @request GET:/patch-notes/{id}
     */
    patchNotesControllerFindOne: (id: string, params: RequestParams = {}) =>
      this.request<PatchNoteDto, void>({
        path: `/patch-notes/${id}`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Patch Notes
     * @name PatchNotesControllerUpdate
     * @summary Update a patch note
     * @request PATCH:/patch-notes/{id}
     * @secure
     */
    patchNotesControllerUpdate: (
      id: string,
      data: UpdatePatchNoteDto,
      params: RequestParams = {},
    ) =>
      this.request<PatchNoteDto, void>({
        path: `/patch-notes/${id}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Patch Notes
     * @name PatchNotesControllerRemove
     * @summary Delete a patch note
     * @request DELETE:/patch-notes/{id}
     * @secure
     */
    patchNotesControllerRemove: (id: string, params: RequestParams = {}) =>
      this.request<PatchNoteDto, void>({
        path: `/patch-notes/${id}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),
  };
}
