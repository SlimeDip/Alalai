import React, { useState, useEffect, useRef } from 'react';
import { LocateFixed, Loader2, MapPin } from 'lucide-react';

const PSGC_BASE = 'https://psgc.cloud/api';

// Simple in-memory cache so repeated typing doesn't spam the API
const cache = {
  provinces: null,
  citiesByProvince: {},
  barangaysByCity: {},
};

export default function LocationFields({
  values, // { province, cityMunicipality, barangay, purokStreet }
  onChangeField, // (fieldName, value) => void
  includeStreet = true,
  required = false,
  layout = 'grid', // 'grid' | 'stacked'
}) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  // Reference lists from PSGC
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  // Selected PSGC codes for cascading filtering
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedCityCode, setSelectedCityCode] = useState('');

  // Active dropdown field ('province' | 'cityMunicipality' | 'barangay' | null)
  const [activeDropdown, setActiveDropdown] = useState(null);
  const wrapperRef = useRef(null);

  // Close suggestion dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Load all Philippine provinces once
  useEffect(() => {
    let active = true;
    async function loadProvinces() {
      if (cache.provinces) {
        setProvinces(cache.provinces);
        return;
      }
      try {
        const res = await fetch(`${PSGC_BASE}/provinces`);
        const data = await res.json();
        // Include Metro Manila (NCR) as a selectable pseudo-province
        const withNcr = [{ code: '1300000000', name: 'Metro Manila (NCR)', isNcr: true }, ...data];
        cache.provinces = withNcr;
        if (active) setProvinces(withNcr);
      } catch {
        // Silently degrade to free-text input if offline
      }
    }
    loadProvinces();
    return () => { active = false; };
  }, []);

  // Match province code if form already has a pre-filled province name
  useEffect(() => {
    if (!values.province || !provinces.length) return;
    const match = provinces.find(
      (p) => p.name.toLowerCase() === values.province.trim().toLowerCase()
    );
    if (match && match.code !== selectedProvinceCode) {
      setSelectedProvinceCode(match.code);
    }
  }, [values.province, provinces]);

  // 2. Load Cities/Municipalities when province changes
  useEffect(() => {
    if (!selectedProvinceCode) {
      setCities([]);
      return;
    }
    let active = true;
    async function loadCities() {
      if (cache.citiesByProvince[selectedProvinceCode]) {
        setCities(cache.citiesByProvince[selectedProvinceCode]);
        return;
      }
      try {
        const endpoint = selectedProvinceCode === '1300000000'
          ? `${PSGC_BASE}/regions/1300000000/cities-municipalities`
          : `${PSGC_BASE}/provinces/${selectedProvinceCode}/cities-municipalities`;
        const res = await fetch(endpoint);
        const data = await res.json();
        cache.citiesByProvince[selectedProvinceCode] = data;
        if (active) setCities(data);
      } catch {
        setCities([]);
      }
    }
    loadCities();
    return () => { active = false; };
  }, [selectedProvinceCode]);

  // Match city code if form already has a pre-filled city name
  useEffect(() => {
    if (!values.cityMunicipality || !cities.length) return;
    const match = cities.find(
      (c) => c.name.toLowerCase() === values.cityMunicipality.trim().toLowerCase()
    );
    if (match && match.code !== selectedCityCode) {
      setSelectedCityCode(match.code);
    }
  }, [values.cityMunicipality, cities]);

  // 3. Load Barangays when city changes
  useEffect(() => {
    if (!selectedCityCode) {
      setBarangays([]);
      return;
    }
    let active = true;
    async function loadBarangays() {
      if (cache.barangaysByCity[selectedCityCode]) {
        setBarangays(cache.barangaysByCity[selectedCityCode]);
        return;
      }
      try {
        const res = await fetch(`${PSGC_BASE}/cities-municipalities/${selectedCityCode}/barangays`);
        const data = await res.json();
        cache.barangaysByCity[selectedCityCode] = data;
        if (active) setBarangays(data);
      } catch {
        setBarangays([]);
      }
    }
    loadBarangays();
    return () => { active = false; };
  }, [selectedCityCode]);

  // FEATURE 1: Auto-fill from Current GPS Location
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    setGeoError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`;
          const res = await fetch(url, {
            headers: { 'Accept-Language': 'en' },
          });
          if (!res.ok) throw new Error('Unable to look up address.');

          const data = await res.json();
          const addr = data.address || {};

          // Map Nominatim fields to Philippine administrative levels
          const detectedProvince =
            addr.province || addr.state || (addr.region?.includes('National Capital') ? 'Metro Manila (NCR)' : '');
          const detectedCity =
            addr.city || addr.town || addr.municipality || '';
          const detectedBarangay =
            addr.suburb || addr.quarter || addr.village || addr.neighbourhood || '';
          const detectedStreet =
            [addr.house_number, addr.road].filter(Boolean).join(' ');

          if (detectedProvince) onChangeField('province', detectedProvince);
          if (detectedCity) onChangeField('cityMunicipality', detectedCity);
          if (detectedBarangay) onChangeField('barangay', detectedBarangay);
          if (includeStreet && detectedStreet) onChangeField('purokStreet', detectedStreet);
        } catch {
          setGeoError('Could not determine your address. Please type it manually.');
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission denied. Enable location access in your browser.');
        } else {
          setGeoError('Unable to get your current location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Filter helper for type-ahead suggestions
  const filterMatches = (list, query) => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter((item) => item.name.toLowerCase().includes(q))
      .slice(0, 8);
  };

  const provinceSuggestions = filterMatches(provinces, values.province);
  const citySuggestions = filterMatches(cities, values.cityMunicipality);
  const barangaySuggestions = filterMatches(barangays, values.barangay);

  return (
    <div ref={wrapperRef}>
      {/* Auto-fill Current Location Trigger */}
      <div className="location-toolbar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleDetectLocation}
          disabled={locating}
        >
          {locating ? <Loader2 size={14} className="spin" /> : <LocateFixed size={14} />}
          {locating ? 'Detecting location...' : 'Use my current location'}
        </button>
        {geoError && (
          <span className="location-error" role="alert">
            {geoError}
          </span>
        )}
      </div>

      <div className={layout === 'grid' ? 'form-grid' : ''}>
        {/* PROVINCE */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label">Province {required && '*'}</label>
          <input
            type="text"
            autoComplete="off"
            required={required}
            placeholder="Type province (e.g., Batangas)"
            value={values.province || ''}
            onFocus={() => setActiveDropdown('province')}
            onChange={(e) => {
              onChangeField('province', e.target.value);
              setSelectedProvinceCode('');
              setSelectedCityCode('');
              setActiveDropdown('province');
            }}
            className="form-input"
          />
          {activeDropdown === 'province' && provinceSuggestions.length > 0 && (
            <ul className="suggest-list" role="listbox">
              {provinceSuggestions.map((prov) => (
                <li
                  key={prov.code}
                  className="suggest-item" role="option"
                  onMouseDown={() => {
                    onChangeField('province', prov.name);
                    onChangeField('cityMunicipality', '');
                    onChangeField('barangay', '');
                    setSelectedProvinceCode(prov.code);
                    setSelectedCityCode('');
                    setActiveDropdown(null);
                  }}
                >
                  {prov.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* CITY / MUNICIPALITY */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label">City / Municipality {required && '*'}</label>
          <input
            type="text"
            autoComplete="off"
            required={required}
            placeholder="Type city or municipality"
            value={values.cityMunicipality || ''}
            onFocus={() => setActiveDropdown('cityMunicipality')}
            onChange={(e) => {
              onChangeField('cityMunicipality', e.target.value);
              setSelectedCityCode('');
              setActiveDropdown('cityMunicipality');
            }}
            className="form-input"
          />
          {activeDropdown === 'cityMunicipality' && citySuggestions.length > 0 && (
            <ul className="suggest-list" role="listbox">
              {citySuggestions.map((city) => (
                <li
                  key={city.code}
                  className="suggest-item" role="option"
                  onMouseDown={() => {
                    onChangeField('cityMunicipality', city.name);
                    onChangeField('barangay', '');
                    setSelectedCityCode(city.code);
                    setActiveDropdown(null);
                  }}
                >
                  {city.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* BARANGAY */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label">Barangay {required && '*'}</label>
          <input
            type="text"
            autoComplete="off"
            required={required}
            placeholder="Type barangay"
            value={values.barangay || ''}
            onFocus={() => setActiveDropdown('barangay')}
            onChange={(e) => {
              onChangeField('barangay', e.target.value);
              setActiveDropdown('barangay');
            }}
            className="form-input"
          />
          {activeDropdown === 'barangay' && barangaySuggestions.length > 0 && (
            <ul className="suggest-list" role="listbox">
              {barangaySuggestions.map((brgy) => (
                <li
                  key={brgy.code}
                  className="suggest-item" role="option"
                  onMouseDown={() => {
                    onChangeField('barangay', brgy.name);
                    setActiveDropdown(null);
                  }}
                >
                  {brgy.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* PUROK / STREET */}
        {includeStreet && (
          <div className="form-group">
            <label className="form-label">Purok / Street</label>
            <input
              type="text"
              name="purokStreet"
              placeholder="Purok / House No. / Street"
              value={values.purokStreet || ''}
              onChange={(e) => onChangeField('purokStreet', e.target.value)}
              className="form-input"
            />
          </div>
        )}
      </div>
    </div>
  );
}