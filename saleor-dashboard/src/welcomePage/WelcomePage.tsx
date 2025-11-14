import { useUser } from "@dashboard/auth";
import useAppChannel from "@dashboard/components/AppLayout/AppChannelContext";
import { hasPermissions } from "@dashboard/components/RequirePermissions";
import { PermissionEnum } from "@dashboard/graphql";
import { Box } from "@saleor/macaw-ui-next";

import { WelcomePageOnboarding } from "./WelcomePageOnboarding";
import { WelcomePageSidebar } from "./WelcomePageSidebar";
import { WelcomePageTilesContainer } from "./WelcomePageTilesContainer";
import { WelcomePageTitle } from "./WelcomePageTitle";

export const WelcomePage = () => {
  const { channel, setChannel } = useAppChannel(false);
  const { user } = useUser();
  const channels = user?.accessibleChannels ?? [];
  const userPermissions = user?.userPermissions || [];
  const hasPermissionToManageOrders = hasPermissions(userPermissions, [
    PermissionEnum.MANAGE_ORDERS,
  ]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={7}
      paddingX={8}
      paddingY={6}
      paddingTop={9}
    >
      <WelcomePageTitle />
      
      <Box display="flex" flexDirection="column" gap={6}>
        <WelcomePageSidebar
          channel={channel}
          setChannel={setChannel}
          channels={channels}
          hasPermissionToManageOrders={hasPermissionToManageOrders}
        />
      </Box>
      
      {/* <WelcomePageOnboarding /> */}
      {/* <WelcomePageTilesContainer /> */}
    </Box>
  );
};
