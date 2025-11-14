import { gql } from "@apollo/client";

export const productReviewsPendingQuery = gql`
  query ProductReviewsPending {
    productReviewsPending {
      id
      product {
        id
        name
        slug
        thumbnail {
          url
        }
      }
      user {
        id
        email
        firstName
        lastName
      }
      rating
      text
      image1
      image2
      createdAt
      isPublished
    }
  }
`;

export const productReviewsPublishedQuery = gql`
  query ProductReviewsPublished {
    productReviewsPublished {
      id
      product {
        id
        name
        slug
        thumbnail {
          url
        }
      }
      user {
        id
        email
        firstName
        lastName
      }
      rating
      text
      image1
      image2
      createdAt
      isPublished
      moderatedBy {
        id
        email
      }
      moderatedAt
    }
  }
`;

