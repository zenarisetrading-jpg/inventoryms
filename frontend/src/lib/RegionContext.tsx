import React, { createContext, useContext, useState, useEffect } from 'react';

type RegionContextType = {
  region: string;
  setRegion: (accountId: string, countryCode: string) => void;
};

const RegionContext = createContext<RegionContextType>({
  region: 's2c_uae_test',
  setRegion: () => {},
});

export const useRegion = () => useContext(RegionContext);

export const RegionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [region, setRegionState] = useState(() => localStorage.getItem('selected_account') || 's2c_uae_test');

  const setRegion = (accountId: string, countryCode: string) => {
    localStorage.setItem('selected_account', accountId);
    localStorage.setItem('selected_country', countryCode);
    setRegionState(accountId);
    // Optionally reload or trigger a custom event so other components that don't
    // use the context directly can re-fetch data
    window.dispatchEvent(new Event('region_changed'));
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const storedAccount = localStorage.getItem('selected_account') || 's2c_uae_test';
      if (storedAccount !== region) {
        setRegionState(storedAccount);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [region]);

  return (
    <RegionContext.Provider value={{ region, setRegion }}>
      {children}
    </RegionContext.Provider>
  );
};
