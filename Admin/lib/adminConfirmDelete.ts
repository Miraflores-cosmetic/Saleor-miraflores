import {
  AdminBackendRequestError,
  adminBackendJson,
} from '@/lib/adminBackendFetch';

/**
 * confirm → DELETE → optional reload; alert on failure.
 * Shared by useAdminResourceList and paginated product list.
 */
export async function adminConfirmDelete(opts: {
  message: string;
  url: string;
  onDone?: () => void | Promise<void>;
}): Promise<boolean> {
  if (!window.confirm(opts.message)) return false;
  try {
    await adminBackendJson(opts.url, { method: 'DELETE' });
    await opts.onDone?.();
    return true;
  } catch (e) {
    alert(e instanceof AdminBackendRequestError ? e.message : 'Не удалось удалить');
    return false;
  }
}
