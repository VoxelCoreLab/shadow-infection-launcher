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

export interface ResponseDownloadLatestDto {
  windows: string;
  macos: string;
  linux: string;
}

export interface ResponseDownloadUrlDto {
  url: string;
  version: string;
}

export interface CreateCheckoutSessionDto {
  /** @format email */
  recipientEmail: string;
  currency: "EUR" | "CHF" | "USD";
}

export interface CreateCheckoutSessionResponseDto {
  url: string;
  sessionId: string;
}

export interface ResponseGamePriceDto {
  currency: string;
  amount: number;
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
 * @title Project Alpha Shop API
 * @version 1.0
 * @contact
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  /**
   * No description
   *
   * @tags App
   * @name AppControllerGetHello
   * @request GET:/
   */
  appControllerGetHello = (params: RequestParams = {}) =>
    this.request<string, any>({
      path: `/`,
      method: "GET",
      format: "json",
      ...params,
    });

  gameLicences = {
    /**
     * No description
     *
     * @tags GameLicences
     * @name GameLicencesControllerGetMyLicence
     * @request GET:/game-licences/my-licence
     * @secure
     */
    gameLicencesControllerGetMyLicence: (params: RequestParams = {}) =>
      this.request<boolean, any>({
        path: `/game-licences/my-licence`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  gameDownloads = {
    /**
     * No description
     *
     * @tags GameDownloads
     * @name GameDownloadsControllerGetLatestGameVersions
     * @request GET:/game-downloads/latest
     */
    gameDownloadsControllerGetLatestGameVersions: (
      params: RequestParams = {},
    ) =>
      this.request<ResponseDownloadLatestDto, any>({
        path: `/game-downloads/latest`,
        method: "GET",
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags GameDownloads
     * @name GameDownloadsControllerGetWindowsDownloadUrl
     * @request GET:/game-downloads/latest/windows
     * @secure
     */
    gameDownloadsControllerGetWindowsDownloadUrl: (
      params: RequestParams = {},
    ) =>
      this.request<ResponseDownloadUrlDto, any>({
        path: `/game-downloads/latest/windows`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags GameDownloads
     * @name GameDownloadsControllerGetMacOsDownloadUrl
     * @request GET:/game-downloads/latest/macos
     * @secure
     */
    gameDownloadsControllerGetMacOsDownloadUrl: (params: RequestParams = {}) =>
      this.request<ResponseDownloadUrlDto, any>({
        path: `/game-downloads/latest/macos`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags GameDownloads
     * @name GameDownloadsControllerGetLinuxDownloadUrl
     * @request GET:/game-downloads/latest/linux
     * @secure
     */
    gameDownloadsControllerGetLinuxDownloadUrl: (params: RequestParams = {}) =>
      this.request<ResponseDownloadUrlDto, any>({
        path: `/game-downloads/latest/linux`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  stripe = {
    /**
     * No description
     *
     * @tags Stripe
     * @name StripeControllerCreateCheckoutSession
     * @request POST:/stripe/create-checkout-session
     * @secure
     */
    stripeControllerCreateCheckoutSession: (
      data: CreateCheckoutSessionDto,
      params: RequestParams = {},
    ) =>
      this.request<CreateCheckoutSessionResponseDto, any>({
        path: `/stripe/create-checkout-session`,
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
     * @tags Stripe
     * @name StripeControllerHandleWebhook
     * @request POST:/stripe/webhook
     */
    stripeControllerHandleWebhook: (params: RequestParams = {}) =>
      this.request<void, any>({
        path: `/stripe/webhook`,
        method: "POST",
        ...params,
      }),
  };
  gamePrices = {
    /**
     * No description
     *
     * @tags GamePrices
     * @name GamePricesControllerListGamePrices
     * @request GET:/game-prices
     */
    gamePricesControllerListGamePrices: (params: RequestParams = {}) =>
      this.request<ResponseGamePriceDto[], any>({
        path: `/game-prices`,
        method: "GET",
        format: "json",
        ...params,
      }),
  };
}
