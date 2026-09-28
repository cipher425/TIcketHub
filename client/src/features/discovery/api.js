import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '../../lib/api';

export const discoveryKeys = {
  home: (city) => ['home', city || 'all'],
  list: (params) => ['events', params],
  event: (idOrSlug) => ['event', idOrSlug],
  cities: ['cities'],
  categories: ['categories'],
};

export const useHome = (city) =>
  useQuery({ queryKey: discoveryKeys.home(city), queryFn: () => http.get('/catalog/home', city ? { city } : undefined).then((r) => r.data) });

export const useCities = () =>
  useQuery({ queryKey: discoveryKeys.cities, queryFn: () => http.get('/catalog/cities').then((r) => r.data), staleTime: 5 * 60_000 });

export const useCategories = () =>
  useQuery({ queryKey: discoveryKeys.categories, queryFn: () => http.get('/catalog/categories').then((r) => r.data), staleTime: Infinity });

/** keepPreviousData: when filters change, the old results stay on screen until new ones arrive (no flicker). */
export const useEventList = (params) =>
  useQuery({ queryKey: discoveryKeys.list(params), queryFn: () => http.get('/events', params), placeholderData: keepPreviousData });

export const useEventDetails = (idOrSlug) =>
  useQuery({ queryKey: discoveryKeys.event(idOrSlug), queryFn: () => http.get(`/events/${idOrSlug}`).then((r) => r.data), enabled: !!idOrSlug });
