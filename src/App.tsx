import './App.css';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WheelGesturesPlugin,
  WheelGesturesPluginOptions,
} from 'embla-carousel-wheel-gestures';

import { ThemeProvider } from './components/theme-provider';
import {
  Carousel,
  CarouselApi,
  CarouselContent,
} from './components/ui/carousel';

import Pages from './Pages';

import { useGetJSONFile } from './hooks/useGetJSONFile';

function App() {
  const scrollListenerRef = useRef<() => void>(() => undefined);
  const [pageInView, setPageInView] = useState(0);
  const listenForScrollRef = useRef(true);
  const scrolling = useRef(false);
  const [api, setApi] = useState<CarouselApi>();

  const onScroll = useCallback((emblaApi: CarouselApi) => {
    if (!emblaApi) return;
    const slidesInView = emblaApi.slidesInView();
    const multiView = slidesInView.length !== 1;
    if (listenForScrollRef.current && multiView && !scrolling.current) {
      scrolling.current = true;
      listenForScrollRef.current = false;
      console.log('started scrolling');
      return;
    }

    if (!multiView && !listenForScrollRef.current && scrolling.current) {
      scrolling.current = false;
      listenForScrollRef.current = true;
      setPageInView(slidesInView[0] ?? 0);
      console.log('finished scrolling');
    }
  }, []);

  const addScrollListener = useCallback(
    (emblaApi: CarouselApi) => {
      if (!emblaApi) return;
      scrollListenerRef.current = () => {
        onScroll(emblaApi);
      };
      emblaApi.on('scroll', scrollListenerRef.current);
    },
    [onScroll],
  );

  useEffect(() => {
    if (!api) {
      return;
    }

    addScrollListener(api);
  }, [api, addScrollListener]);

  const data = useGetJSONFile<JSONData>('data.json');

  if (data === null) {
    return <div>Waiting...</div>;
  }

  return (
    <ThemeProvider defaultTheme='dark' storageKey='ui-theme'>
      <Carousel
        setApi={setApi}
        orientation='vertical'
        plugins={[
          WheelGesturesPlugin({
            forceWheelAxis: 'y',
          } as WheelGesturesPluginOptions),
        ]}
        opts={{
          align: 'start',
          loop: false,
        }}
      >
        <CarouselContent className='h-dvh'>
          <Pages data={data} inView={pageInView} />
        </CarouselContent>
      </Carousel>
    </ThemeProvider>
  );
}

export default App;
