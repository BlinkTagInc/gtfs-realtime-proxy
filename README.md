# GTFS-Realtime Proxy

An API to retrieve GTFS-Realtime data, add CORS headers and cache responses. This makes GTFS-Realtime available directly to client-side code within a web browser.

Built with next.js.

## Local setup

    npm install

Configure the `FETCH_URL` to use your GTFS-Realtime URLs in `app/vehiclespositions/route.ts`, `app/tripupdates/route.ts` and `app/alerts/route.ts`,

## Running Locally

    npm run dev

Open the following URLs to see the result:

* [http://localhost:3000/vehiclepositions](http://localhost:3000/vehiclepositions)
* [http://localhost:3000/tripupdates](http://localhost:3000/tripupdates)
* [http://localhost:3000/alerts](http://localhost:3000/alerts)

## Running in production

    npm run build
    npm start
