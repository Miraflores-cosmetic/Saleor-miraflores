import { gql } from "@apollo/client";

export const productReviewModerateMutation = gql`
  mutation ProductReviewModerate($input: ProductReviewModerateInput!) {
    productReviewModerate(input: $input) {
      review {
        id
        isPublished
        moderatedBy {
          id
          email
        }
        moderatedAt
      }
      errors {
        field
        code
        message
      }
    }
  }
`;

