import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAppConfig } from '../../hooks/useCommon';

export const seatKeys = {
  layout: (id) => ['seat-layout', id],
  availability: (id) => ['seat-availability', id],
};

/**
 * Seat map data comes in two parts:
 *  - layout (static, cached for minutes)
 *  - availability (dynamic): Stage 1 polls every 10s; Stage 3 receives Socket.IO pushes
 *    and falls back to slow polling.
 */
export function useSeatData(eventId) {
  const qc = useQueryClient();
  const { data: config } = useAppConfig();
  const realtime = !!config?.realtimeEnabled;

  const layout = useQuery({
    queryKey: seatKeys.layout(eventId),
    queryFn: () => http.get(`/events/${eventId}/seat-layout`).then((r) => r.data),
    enabled: !!eventId,
    staleTime: 5 * 60_000,
  });

  const availability = useQuery({
    queryKey: seatKeys.availability(eventId),
    queryFn: () => http.get(`/events/${eventId}/seat-availability`).then((r) => r.data),
    enabled: !!eventId,
    staleTime: 0,
    refetchInterval: realtime ? 30_000 : 10_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!realtime || !eventId) return undefined;
    const socket = getSocket();
    const join = () => socket.emit('event:join', eventId);
    join();
    socket.on('connect', join);
    const onUpdate = (msg) => {
      if (msg.refresh) {
        qc.invalidateQueries({ queryKey: seatKeys.availability(eventId) });
        return;
      }
      // Apply the delta to the cached availability list without refetching.
      qc.setQueryData(seatKeys.availability(eventId), (old) => {
        if (!old) return old;
        const map = new Map(old.seats.map((s) => [s.id, s.s]));
        for (const c of msg.changes || []) {
          if (c.s === 'A') map.delete(c.id);
          else map.set(c.id, c.s);
        }
        return { ...old, seats: [...map].map(([id, s]) => ({ id, s })) };
      });
    };
    socket.on('seats:update', onUpdate);
    return () => {
      socket.emit('event:leave', eventId);
      socket.off('connect', join);
      socket.off('seats:update', onUpdate);
    };
  }, [realtime, eventId, qc]);

  const statusById = useMemo(() => new Map((availability.data?.seats || []).map((s) => [s.id, s.s])), [availability.data]);

  return { layout, availability, statusById, realtime };
}
