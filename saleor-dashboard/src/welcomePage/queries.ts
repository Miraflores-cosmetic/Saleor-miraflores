import { gql } from "@apollo/client";

export const welcomePageActivities = gql`
  query WelcomePageActivities($hasPermissionToManageOrders: Boolean!) {
    activities: homepageEvents(last: 10) @include(if: $hasPermissionToManageOrders) {
      edges {
        node {
          ...Activities
        }
      }
    }
  }
`;

export const welcomePageAnalytics = gql`
  query WelcomePageAnalytics($channel: String!, $hasPermissionToManageOrders: Boolean!) {
    salesToday: ordersTotal(period: TODAY, channel: $channel)
      @include(if: $hasPermissionToManageOrders) {
      gross {
        amount
        currency
      }
    }
  }
`;

export const welcomePageNotifications = gql`
  query welcomePageNotifications($channel: String!) {
    productsOutOfStock: products(filter: { stockAvailability: OUT_OF_STOCK }, channel: $channel) {
      totalCount
    }
  }
`;

export const abandonedCheckouts = gql`
  query AbandonedCheckouts($channel: String!) {
    checkouts(first: 100, channel: $channel) {
      totalCount
      edges {
        node {
          id
          token
          email
          user {
            email
            firstName
            lastName
          }
          created
          lastChange
          lines {
            id
            quantity
            variant {
              id
              name
              product {
                name
              }
            }
            totalPrice {
              gross {
                amount
              }
            }
          }
          totalPrice {
            gross {
              amount
              currency
            }
          }
        }
      }
    }
  }
`;

export const topProductSales = gql`
  query TopProductSales($period: ReportingPeriod!, $channel: String!) {
    reportProductSales(period: $period, first: 5, channel: $channel) {
      edges {
        node {
          id
          name
          sku
          quantityOrdered
          revenue(period: $period) {
            gross {
              amount
              currency
            }
          }
          product {
            id
            name
            thumbnail {
              url
            }
          }
        }
      }
    }
  }
`;

export const complexDashboardStats = gql`
  query ComplexDashboardStats($period: ReportingPeriod!, $channel: String!) {
    # Общая выручка
    ordersTotal(period: $period, channel: $channel) {
      gross {
        amount
        currency
      }
    }
    
    # Все заказы за период
    orders(first: 100, channel: $channel) {
      totalCount
      edges {
        node {
          id
          created
          total {
            gross {
              amount
            }
          }
        }
      }
    }
    
    # Все корзины за период (для расчёта конверсии)
    checkouts(first: 100, channel: $channel) {
      totalCount
      edges {
        node {
          id
          created
          lastChange
          lines {
            id
          }
        }
      }
    }
    
    # Новые клиенты
    customers(first: 100) {
      totalCount
      edges {
        node {
          id
          dateJoined
        }
      }
    }
  }
`;
