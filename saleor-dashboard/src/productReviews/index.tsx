import { Route } from "@dashboard/components/Router";
import { sectionNames } from "@dashboard/intl";
import { useIntl } from "react-intl";
import { RouteComponentProps, Switch } from "react-router-dom";

import { WindowTitle } from "../components/WindowTitle";
import { productReviewListPath, productReviewPublishedPath } from "./urls";
import { ProductReviewList } from "./views/ProductReviewList";
import { ProductReviewPublished } from "./views/ProductReviewPublished";

const ProductReviewListRoute = ({ location }: RouteComponentProps) => {
  return <ProductReviewList />;
};

const ProductReviewPublishedRoute = ({ location }: RouteComponentProps) => {
  return <ProductReviewPublished />;
};

const Component = () => {
  const intl = useIntl();

  return (
    <>
      <WindowTitle
        title={intl.formatMessage({
          id: "productReviews.title",
          defaultMessage: "Отзывы на модерацию",
        })}
      />
      <Switch>
        <Route exact path={productReviewListPath} component={ProductReviewListRoute} />
        <Route exact path={productReviewPublishedPath} component={ProductReviewPublishedRoute} />
      </Switch>
    </>
  );
};

export default Component;

