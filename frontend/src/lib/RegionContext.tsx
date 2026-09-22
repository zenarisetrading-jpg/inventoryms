import React, { createContext, useContext, useState, useEffect } from 'react';

type RegionContextType = {
  region: string;
  country: string;
  setRegion: (accountId: string, countryCode: string) => void;
};

function inferCountry(accountId: string): string {
  const stored = localStorage.getItem('selected_country');
  if (stored) return stored;
  if (accountId === 's2c_test' || accountId.toLowerCase().includes('ksa')) return 'KSA';
  return 'UAE';
}

const RegionContext = createContext<RegionContextType>({
  region: 's2c_uae_test',
  country: 'UAE',
  setRegion: () => {},
});

export const useRegion = () => useContext(RegionContext);

export const RegionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [region, setRegionState] = useState(() => localStorage.getItem('selected_account') || 's2c_uae_test');
  const [country, setCountryState] = useState(() => inferCountry(localStorage.getItem('selected_account') || 's2c_uae_test'));

  const setRegion = (accountId: string, countryCode: string) => {
    localStorage.setItem('selected_account', accountId);
    localStorage.setItem('selected_country', countryCode);
    setRegionState(accountId);
    setCountryState(countryCode);
    // Trigger custom event for external subscribers
    window.dispatchEvent(new Event('region_changed'));
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const storedAccount = localStorage.getItem('selected_account') || 's2c_uae_test';
      const storedCountry = inferCountry(storedAccount);
      if (storedAccount !== region || storedCountry !== country) {
        setRegionState(storedAccount);
        setCountryState(storedCountry);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [region, country]);

  return (
    <RegionContext.Provider value={{ region, country, setRegion }}>
      {children}
    </RegionContext.Provider>
  );
};
