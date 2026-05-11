# Keem's Graduation Data Wrapped

This project takes Kim's years of tracked data on Togl and does some fun analysis on it and finally shows this data in a silly way a la Spotify Wrapped.

## How to work with this

### Install prerequisites

Make sure you have Node installed, version >= 22

Install yarn: [Mac install steps](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable)

NOTE: yes I still use the old yarn, haven't tried using newer versions of yarn yet and forgot to for this before it was too late

### Install dependencies

Simply run:

```shell
yarn install
```

This will install all the node packages and *should* also install SQLite

### Create the SQLite database

The command to create the database is:

```shell
yarn process
```

The script is in [scripts/processCSV.ts](scripts/processCSV.ts). This is processing the CSV files in the `data_source` folder which came from Togl. If you want to add new data you can put new CSV files in there but make sure you update the script as it is hardcoded to know which files to process by name (would be nice to update this so that it just processes all *.csv in the folder).

The first step is that the CSV files are read, certain columns ignored, some column data transformed (date and time combined into one property), and some new meta data created (specifically the "tags" that I created based on patterns I saw). This data is then inserted into a table named `raw` in the SQLite DB file which will be put in `sqlite/grad-data.db`.

```typescript
/**
 * Table "raw" contains all data entries from the CSV
 * 
 * type - JSON array of tag strings - TagType[] - @see TagType
 * billable - 0 | 1
 * start - ISO8601
 * end - ISO8601
 * duration - seconds
 */
await db.exec(SQL`CREATE TABLE IF NOT EXISTS raw (
  project TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT,
  billable INTEGER NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  duration INTEGER NOT NULL
);`);
```

NOTE: the `sqlite/grad-data.db` file is too large to upload to github, that is why it is gitignore'd

Once all of the files have been loaded into the DB it will then actually perform a couple of relatively complicated queries against the `raw` table in order to fill a few more tables:

- `totalsGrouped`
  - Table definition:
  
    ```typescript
    /**
    * Table "totalsGrouped" aggregates the durations by project+description and additionally
    * calculates a breakdown of the duration by hour of the day, day of the week, and year
    * 
    * type - JSON array of tag strings - TagType[] - @see TagType
    * totalTime - seconds
    * histogramHour - JSON object - { '00': 23134, '01': 4523456, ... } - only includes hours with data
    * histogramDay - JSON object - { '0': 23134, '1': 4523456, ... } - only includes days with data
    *  days start with Monday and represented by 0-6
    * histogramYear - JSON object - { '2022': 23134, '2023': 4523456, ... } - only includes years with data
    */
    await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsGrouped (
      project TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT,
      totalTime INTEGER NOT NULL,
      histogramHour TEXT NOT NULL,
      histogramDay TEXT NOT NULL,
      histogramYear TEXT NOT NULL,
      PRIMARY KEY (project, description)
    );`);
    ```

- `totalsTyped`
  - Table definition

    ```typescript
    /**
     * Table "totalsTyped" aggregates the durations by tag type and additionally
    * calculates a breakdown of the duration by hour of the day, day of the week, and year
    * 
    * type - @see TagType
    * totalTime - seconds
    * histogramHour - JSON object - { '00': 23134, '01': 4523456, ... } - only includes hours with data
    * histogramDay - JSON object - { '0': 23134, '1': 4523456, ... } - only includes days with data
    *  days start with Monday and represented by 0-6
    * histogramYear - JSON object - { '2022': 23134, '2023': 4523456, ... } - only includes years with data
    */
    await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsTyped (
      type TEXT,
      totalTime INTEGER NOT NULL,
      histogramHour TEXT NOT NULL,
      histogramDay TEXT NOT NULL,
      histogramYear TEXT NOT NULL,
      PRIMARY KEY (type)
    );`);
    ```

- `totalsTime`
  - This table keeps the aggregated duration for as many time slices/patterns I could come up with. These are like: by day of the week, by week of the month, by month of the year, by year, by hour in the day, etc.

    ```typescript
    /**
    * Table "totalsTyped" aggregates the durations by tag type and additionally
    * calculates a breakdown of the duration by hour of the day, day of the week, and year
    * 
    * timeType - @see TimeType
    * timeValue - depends on timeType, see the insert code for comments showing the format
    * totalTime - seconds
    */
    await db.exec(SQL`CREATE TABLE IF NOT EXISTS totalsTime (
      timeType TEXT NOT NULL,
      timeValue TEXT NOT NULL,
      totalTime INTEGER NOT NULL,
      PRIMARY KEY (timeType, timeValue)
    );`);
    ```

NOTE: each time this script is run all of the tables it specifically created are first deleted and then recreated.

### Create the JSON data file the app uses

The command to create the data file is:

```shell
yarn getData
```

The script is in [scripts/getData.ts](scripts/getData.ts).

This script's job is to pull out data from the SQLite DB that will actually drive the app and saves it to a json file.

The first step is to perform a query against the `totalsTime` table in order to figure out the top 3 of each `timeType`. It then transforms the the `timeValue` into a readable value (for example `timeType = 'hourDayWeek'` and `timeValue = '1_22'` results in `'Tuesday at 10 pm'`).

Then it simply gets all the values from `totalsTime` (again making readable values), `totalsTyped` (converting the histogram columns into actual objects), and `totalsGrouped` (converting the histogram columns into actual objects).

Finally, it writes all this data to `public/data.json`.

### Working with the SQLite DB

Make sure you have `sqlite3` installed and available on your `$PATH` so you can use it in your terminal. You can check if it is installed with `command -v sqlite3`. (if you don't, I just used homebrew to install it)

NOTE: Keep in mind that our [javascript package for SQLite3](https://github.com/TryGhost/node-sqlite3) uses SQLITE v3.45.0, which is pretty new but not the newest, so if you have a newer one you might have features that my script isn't capable of.

In a terminal from the project root type:

```shell
sqlite3 sqlite/grad-data.db
```

This will open a connection to the DB and put you into a `sqlite` terminal to interact with it. What I found to be the best experience is to use a VSCode editor window to construct your query with intellisense and then copy/paste into the `sqlite` terminal to actually execute it.

NOTE: make sure you put a `;` at the end of the query or else `sqlite` will keep letting you hit enter without actually executing.

When you are done with the `sqlite3` terminal you can exit it by typing `.exit`

You can consider using a VSCode extension to interact with the DB file as well. I tried one and ran into issues because it was using an older version of SQLite that was lacking useful features, so I stuck with the terminal.

## Technology Bird used this project as an excuse to play with

- [Vite](https://vitejs.dev/guide/why.html)
  - I've always used webpack in the past but have been keeping track of the Vite project and thought it was the best of the many new projects out there
  - My favorite things about it are:
    - The dev server is super fast. It handles the dependencies (node_modules) different from your source code since dependencies are essentially already "good to go" whereas source usually still needs transforming (such as typescript) and changes often. It uses [esbuild](https://esbuild.github.io/) to handle the dependencies which is another project that I think is so awesome (it is also written in Go when I have a strong bias for), though it is not yet production ready. For the source files it only transforms the files and serves them without bundling directly to the browser, relying on new ability of browsers to handle ESM directly. This is awesome for a variety of reasons such as HMR is basically "built in" since the browser just has to pull the changed file in again.
    - The configuration is dead simple, so much of what I would normally do to build a simple typescript project
    - Super fast
- SQLite
  - I just never had a reason to play with it but we are using it in our apps now and have played around with a concept for the cloud of creating a dedicated database per user using SQLite which would mean no contention on heavy read/write tables
  - It is pretty similar to my experience with MSSQL and also has "first class" support for JSOMN data, though I believe that PostGres is even better and also newer versions MSSQL might have better JSON support than I know about yet
- [date-fns](https://date-fns.org/)
  - In the past I've used Moment.js which was a fine experience but it is in (maintenance mode)[https://momentjs.com/docs/#/-project-status/] and won't be making any changes like converting to ESM or making an immutable version.
  - date-fns is an "alternative" that is really just a bunch of helper functions to be used on top of the built in Javascript Dat object, pretty nice experience so far
- (fast-csv)[https://c2fo.github.io/fast-csv/docs/introduction/getting-started/]
  - Just a nice tool to parse (and format) CSV files
  - It was a fun way to learn more about how streams work in Javascript
- (tailwindcss)[https://tailwindcss.com/]
  - In the past I've used Bootstrap (via its utility classes) in much the same way tailwindcss is designed and augmented it with CSS modules
  - Tailwindcss utility classes are a bit more full featured it seems, though it does lack some useful component classes that Bootstrap had like `btn`
- (daisyui)[https://daisyui.com/docs/use/]
  - Closer to Bootstrap, it composes the tailwindcss utility classes into some component classes, but the philosophy is still "prefer utility first"
  - Plus it has a ton of built in themes that I plan to use to make the different "pages" pop with each swipe, since you can apply a different theme at any point in the HTML using `data-theme="cool_theme_name"` attribute
- Chart unsure but I think (apex charts)[https://apexcharts.com/docs/react-charts/#]
  - Compared to my prior experience with D3.js this is much more out of the box which is nice for speed. But a lot of fun things like animation and styling is also built in.
  - This charting library, unlike many others, is not actually a wrapper over D3 but is a ground up implementation, which is intriguing

## Some possibly interesting things about this project

### Patches

Sometimes you might add a javascript package but it doesn't work exactly how you want. if this is a relatively large difference you could fork the repo and make your own version with the changes you want or just write your own version from "scratch" (heavy copy pasting). However, sometimes the thing you need is very small or even a small bug that you need fixed and don't want to wait for the maintainers to deal with. Another small thing that often happens is if the package has a badly defined typescript type file (like they used `any` for a type but there is an actual type that could be used instead).

The best way to handle those types of small changes that I know of is to use `patch-package`. You basically just go into your `./node_modules/` folder and directly modify the files you want changed, then run the `patch-package` tool against that package and it will create a patch for you in the `./patches/` folder.

I've done this for `apexcharts` to fix a couple of type issues. (I would propose a PR to the actual project, and may still, but i'm not 100% sure that my patch is correct for everyone... it works for me but I'm not certain it is the best way to handle it).

The way this works for others is there is a `postinstall` script defined in `./package.json` and when you run `yarn install` the `postinstall` script will automatically be ran every time. That means anyone else working in this project will have the same changes applied without any effort on their end.

## Bird's immense admiration

I am so proud of all that you have achieved in this process so far. Time plays tricks on us, but I remember like it was yesterday talking with you about algebra on the front lawn of the Columbia house and you expressing how hard it was. When you then told me you were pursuing Computer Science I was so impressed! I recall thinking you sounded both apprehensive and excited. Your tenacity acquiring scholarships and ultimately scoring Ford was incredible in its own right! Watching you then grab onto literally everything that college has to offer like the clubs, the friends, conferences, connections with professors, projects out of classes, and even study abroad (I mean come on!!) was so cool!! Every one of those meaningfully impacted your personal growth and I'm so glad you mostly did not heed my advice about pulling away from some of it. One of my favorite things that I was able to bear witness to was how you experienced the difficulty of the course work as the terms went on. I know you had low moments and that it felt at times as though it was always hard, but I think I had the clearer vantage point as I was able to see that not only was your personal level of struggle staying the same as the course difficulty continued to rise, for a good amount of terms at the end there your Struggle Level™ was actually decreasing!

I know this post college era is going to be just a remarkable. I can't wait to see that Togl data :wink:

You inspire me.
