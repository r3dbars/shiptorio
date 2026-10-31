// index.html's only job: carry the visit, query included, to the deck. Old links (?source=sim, ?scenario=...) keep working.
location.replace(`/deck${location.search}`);
