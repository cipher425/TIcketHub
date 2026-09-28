import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAppConfig } from '../../hooks/useCommon';
import { toast } from 'sonner';

export function NotificationBell() {
  const qc = useQueryClient();
  const { data: config } = useAppConfig();
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => http.get('/notifications/unread-count').then((r) => r.data.count),
    refetchInterval: config?.realtimeEnabled ? false : 60_000, // Stage 1 polls, Stage 3 gets pushed
  });

  useEffect(() => {
    if (!config?.realtimeEnabled) return undefined;
    const socket = getSocket();
    const onNew = (n) => {
      toast(n.title);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    };
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, [config?.realtimeEnabled, qc]);

  return (
    <Link to="/account/notifications" className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
      <Bell className="h-5 w-5" />
      {data > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {data > 9 ? '9+' : data}
        </span>
      )}
    </Link>
  );
}
