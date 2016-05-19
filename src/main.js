import * as utilities from './utilities';
import * as extractors from './featureExtractors';
// jsfft is required by complex_array, but doesn't export anything
require('jsfft');
import * as complexArray from 'jsfft/lib/complex_array';
import { MeydaAnalyzer } from './meyda-wa';

const prepareSignalWithSpectrum = (signal, windowingFunction, bufferSize) => {
  const preparedSignal = {};

  if (typeof signal.buffer === 'undefined') {
    // signal is a normal array, convert to F32A
    preparedSignal.signal = utilities.arrayToTyped(signal);
  } else {
    preparedSignal.signal = signal;
  }

  preparedSignal.windowedSignal = utilities.applyWindow(
    preparedSignal.signal,
    windowingFunction);

  // create complexarray to hold the spectrum
  const data = new complexArray.ComplexArray(bufferSize);

  // map time domain
  data.map((value, i) => {
    const v = value;
    v.real = preparedSignal.windowedSignal[i];
    return v;
  });

  // Functions shouldn't start with upper case chars, this trips our linter
  data.fft = data.FFT;
  preparedSignal.complexSpectrum = data.fft();
  preparedSignal.ampSpectrum = new Float32Array(bufferSize / 2);
  for (let i = 0; i < bufferSize / 2; i++) {
    preparedSignal.ampSpectrum[i] = Math.sqrt(
      Math.pow(preparedSignal.complexSpectrum.real[i], 2) +
      Math.pow(preparedSignal.complexSpectrum.imag[i], 2));
  }

  return preparedSignal;
};

const Meyda = {
  audioContext: null,
  spn: null,
  bufferSize: 512,
  sampleRate: 44100,
  melBands: 26,
  callback: null,
  windowingFunction: 'hanning',
  featureExtractors: extractors,
  EXTRACTION_STARTED: false,
  _featuresToExtract: [],
  windowing: utilities.applyWindow,
  // TODO: We're using this a dependency, we should use an import
  errors: {
    notPow2: new Error(
        'Meyda: Buffer size must be a power of 2, e.g. 64 or 512'),
    featureUndef: new Error('Meyda: No features defined.'),
    invalidFeatureFmt: new Error('Meyda: Invalid feature format'),
    invalidInput: new Error('Meyda: Invalid input.'),
    noAC: new Error('Meyda: No AudioContext specified.'),
    noSource: new Error('Meyda: No source node specified.'),
  },

  createMeydaAnalyzer: options => new MeydaAnalyzer(options, Meyda),

  extract: (feature, signal, previousSignal) => {
    if (!signal) {
      throw this.errors.invalidInput;
    } else if (typeof signal !== 'object') {
      throw this.errors.invalidInput;
    } else if (!feature) {
      throw this.errors.featureUndef;
    } else if (!utilities.isPowerOfTwo(signal.length)) {
      throw this.errors.notPow2;
    }

    if (typeof this.barkScale === 'undefined' ||
            this.barkScale.length !== this.bufferSize) {
      this.barkScale = utilities.createBarkScale(
          this.bufferSize,
          this.sampleRate,
          this.bufferSize
      );
    }

    // Recalcuate mel bank if buffer length changed
    if (typeof this.melFilterBank === 'undefined' ||
            this.barkScale.length !== this.bufferSize ||
            this.melFilterBank.length !== this.melBands) {
      this.melFilterBank = utilities.createMelFilterBank(
          this.melBands,
          this.sampleRate,
          this.bufferSize);
    }

    if (typeof signal.buffer === 'undefined') {
      // signal is a normal array, convert to F32A
      this.signal = utilities.arrayToTyped(signal);
    } else {
      this.signal = signal;
    }

    let preparedSignal = prepareSignalWithSpectrum(
            signal,
            this.windowingFunction,
            this.bufferSize);

    this.signal = preparedSignal.windowedSignal;
    this.complexSpectrum = preparedSignal.complexSpectrum;
    this.ampSpectrum = preparedSignal.ampSpectrum;

    if (previousSignal) {
      preparedSignal = prepareSignalWithSpectrum(previousSignal,
              this.windowingFunction,
              this.bufferSize);

      this.previousSignal = preparedSignal.windowedSignal;
      this.previousComplexSpectrum = preparedSignal.complexSpectrum;
      this.previousAmpSpectrum = preparedSignal.ampSpectrum;
    }

    if (typeof feature === 'object') {
      const results = {};
      for (let x = 0; x < feature.length; x++) {
        results[feature[x]] = (this.featureExtractors[feature[x]]({
          ampSpectrum: this.ampSpectrum,
          complexSpectrum: this.complexSpectrum,
          signal: this.signal,
          bufferSize: this.bufferSize,
          sampleRate: this.sampleRate,
          barkScale: this.barkScale,
          melFilterBank: this.melFilterBank,
          previousSignal: this.previousSignal,
          previousAmpSpectrum: this.previousAmpSpectrum,
          previousComplexSpectrum: this.previousComplexSpectrum,
        }));
      }

      return results;
    } else if (typeof feature === 'string') {
      return this.featureExtractors[feature]({
        ampSpectrum: this.ampSpectrum,
        complexSpectrum: this.complexSpectrum,
        signal: this.signal,
        bufferSize: this.bufferSize,
        sampleRate: this.sampleRate,
        barkScale: this.barkScale,
        melFilterBank: this.melFilterBank,
        previousSignal: this.previousSignal,
        previousAmpSpectrum: this.previousAmpSpectrum,
        previousComplexSpectrum: this.previousComplexSpectrum,
      });
    }
    throw this.errors.invalidFeatureFmt;
  },
};

export default Meyda;

if (typeof window !== 'undefined') window.Meyda = Meyda;
