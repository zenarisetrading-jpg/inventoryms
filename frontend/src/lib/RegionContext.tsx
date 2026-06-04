import React, { createContext, useContext, useState, useEffect } from 'react';

type RegionContextType = {
  region: string;
  setRegion: (region: string) => void;
};

const RegionContext = createContext<RegionContextType>({
  region: 'UAE',
  setRegion: () => {},
});

export const useRegion = () => useContext(RegionContext);

export const RegionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [region, setRegionState] = useState(() => localStorage.getItem('selected_region') || 'UAE');

  const setRegion = (newRegion: string) => {
    localStorage.setItem('selected_region', newRegion);
    setRegionState(newRegion);
    // Optionally reload or trigger a custom event so other components that don't
    // use the context directly can re-fetch data
    window.dispatchEvent(new Event('region_changed'));
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const storedRegion = localStorage.getItem('selected_region') || 'UAE';
      if (storedRegion !== region) {
        setRegionState(storedRegion);
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
