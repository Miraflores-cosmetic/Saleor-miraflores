import urlJoin from "url-join";

import { stringifyQs } from "../utils/urls";

const productReviewsSection = "/product-reviews/";

export const productReviewListPath = productReviewsSection;
export const productReviewPublishedPath = urlJoin(
  productReviewsSection,
  "published"
);
export type ProductReviewListUrlQueryParams = {};
export const productReviewListUrl = (params?: ProductReviewListUrlQueryParams): string =>
  productReviewListPath + (params ? "?" + stringifyQs(params) : "");
export const productReviewPublishedUrl = (params?: ProductReviewListUrlQueryParams): string =>
  productReviewPublishedPath + (params ? "?" + stringifyQs(params) : "");

