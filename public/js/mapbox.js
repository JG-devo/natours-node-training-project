/* eslint-disable */

export const displayMap = locations => {
  mapboxgl.accessToken =
    'pk.eyJ1IjoiamctZGV2byIsImEiOiJja3hlcmFiankzcXgzMm9vMXZlYWNmdnFlIn0.__K_LP0_G7NM_GAl4_eXKw';
  const map = new mapboxgl.Map({
    container: 'map', //matches the ID in CSS/HTML
    style: 'mapbox://styles/jg-devo/ckxerdqfng35314pam65eqdua',
    scrollZoom: false,
    // center: [-118.120627, 34.108896],
    // zoom: 10,
    // interactive: false,
  });

  const bounds = new mapboxgl.LngLatBounds();

  locations.forEach(loc => {
    // Create marker
    const el = document.createElement('div');
    el.className = 'marker';

    // Add marker
    new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat(loc.coordinates)
      .addTo(map);

    // Add popup
    new mapboxgl.Popup({
      offset: 40,
    })
      .setLngLat(loc.coordinates)
      .setHTML(`<p>Day ${loc.day}: ${loc.description}</p>`)
      .addTo(map);

    // Extends map bounds to include current location
    bounds.extend(loc.coordinates);
  });

  map.fitBounds(bounds, {
    padding: {
      top: 200,
      bottom: 200,
      left: 100,
      right: 100,
    },
  });
};
