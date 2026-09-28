import { createContext, useContext } from 'react';
import { useLocalStorage } from '../../hooks/useCommon';

const CityContext = createContext({ city: '', setCity: () => {} });

/** The user's chosen city (remembered in localStorage) personalises the home page. */
export function CityProvider({ children }) {
  const [city, setCity] = useLocalStorage('th_city', '');
  return <CityContext.Provider value={{ city, setCity }}>{children}</CityContext.Provider>;
}

export const useCity = () => useContext(CityContext);
