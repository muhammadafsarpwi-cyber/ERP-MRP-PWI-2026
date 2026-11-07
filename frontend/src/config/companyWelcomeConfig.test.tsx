import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Welcome from '../pages/auth/Welcome';
import WelcomeDivisionSettings from '../components/settings/WelcomeDivisionSettings';
import {
  DEFAULT_DIVISION_LIFECYCLES,
  DEFAULT_WELCOME_PORTAL_CONFIG,
  FUTURISTIC_EARTH_BANNER_URL,
  SCENE_PRESET_MAP,
  WelcomePortalConfig,
  getDefaultDivisionLifecycles,
  normalizeWelcomePortalConfig,
} from './companyWelcomeConfig';
import { useCompanyWelcomeStore } from '../store/companyWelcomeStore';

jest.setTimeout(25000);

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

describe('Centralized Company & Department-Synchronized Background System', () => {
  beforeEach(() => {
    localStorage.clear();
    useCompanyWelcomeStore.getState().hydrateFromStorage();
  });

  it('maps dedicated high-tech 3D scenes to every department across Spoke, Control Cable, Main Division E-51, and NB Division', () => {
    const divisions = getDefaultDivisionLifecycles();
    expect(divisions).toHaveLength(4);

    // 1. Spoke Division
    const spoke = divisions.find((d) => d.name === 'Spoke Division')!;
    expect(spoke.departments.map((s) => [s.name, s.sceneKey])).toEqual([
      ['Raw Material', 'raw_material'],
      ['Straightener Department', 'straightener'],
      ['Swagging Department', 'swagging'],
      ['Spoke Department', 'spoke_forming'],
      ['Spoke Plating Department', 'electroplating'],
      ['Spoke Packing', 'packing_dispatch'],
      ['Dispatch Department', 'global_earth'],
    ]);

    // 2. Control Cable Division
    const cable = divisions.find((d) => d.name === 'Control Cable Division')!;
    expect(cable.departments.map((s) => [s.name, s.sceneKey])).toEqual([
      ['Raw Material', 'raw_material'],
      ['Flattening Department', 'flattening'],
      ['Spiral Department', 'spiral_winding'],
      ['PVC Department', 'pvc_extrusion'],
      ['Packing Department', 'packing_dispatch'],
      ['Dispatch Department', 'global_earth'],
    ]);

    // 3 & 4. Main Division E-51 & NB Division (Wire Drawing + Stranding Flows)
    for (const divName of ['Main Division E-51', 'NB Division']) {
      const wireDiv = divisions.find((d) => d.name === divName)!;
      expect(wireDiv.flowLayout).toBe('wire_and_stranding');
      expect(wireDiv.stranding!.strandingSceneKey).toBe('stranding_machine');
      expect(wireDiv.stranding!.bundleSceneKey).toBe('wire_bundles');
      expect(wireDiv.stranding!.bundleOutput).toBe('Finished Inner Wire Bundles');
    }
  });

  it('synchronizes WelcomeBackground dynamically as departments and Stranding stages change across all 4 divisions', () => {
    render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>,
    );

    const bgContainer = screen.getByTestId('welcome-holographic-earth-bg');
    const showcase = screen.getByTestId('welcome-lifecycle-showcase');
    const activeBgSrc = () =>
      (bgContainer.querySelector('.erp-welcome-slide.is-active img') as HTMLImageElement)?.getAttribute('src');

    // Initial stage of Spoke Division: Raw Material -> dept-raw-material.jpg
    expect(bgContainer).toHaveAttribute('data-active-department', 'Raw Material');
    expect(bgContainer).toHaveAttribute('data-active-scene', 'raw_material');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.raw_material.imageUrl);

    // Step to Straightener Department -> dept-straightener.jpg
    fireEvent.click(within(showcase).getByText('Straightener Department'));
    expect(bgContainer).toHaveAttribute('data-active-department', 'Straightener Department');
    expect(bgContainer).toHaveAttribute('data-active-scene', 'straightener');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.straightener.imageUrl);

    // Step to Swagging Department -> dept-swagging.jpg
    fireEvent.click(within(showcase).getByText('Swagging Department'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'swagging');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.swagging.imageUrl);

    // Step to Spoke Plating Department -> dept-electroplating.jpg
    fireEvent.click(within(showcase).getByText('Spoke Plating Department'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'electroplating');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.electroplating.imageUrl);

    // Step to Dispatch Department -> Futuristic Holographic Earth
    fireEvent.click(within(showcase).getByText('Dispatch Department'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'global_earth');
    expect(activeBgSrc()).toBe(FUTURISTIC_EARTH_BANNER_URL);

    // Switch to Division 2 (Control Cable Division) -> Spiral Department -> dept-spiral-winding.jpg
    fireEvent.click(
      within(showcase).getByRole('tab', { name: /Division 2: Control Cable Division/i }),
    );
    fireEvent.click(within(showcase).getByText('Spiral Department'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'spiral_winding');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.spiral_winding.imageUrl);

    // Switch to Division 3 (Main Division E-51 — Wire Drawing + Stranding)
    fireEvent.click(
      within(showcase).getByRole('tab', { name: /Division 3: Main Division E-51/i }),
    );
    fireEvent.click(within(showcase).getByText('Wire Drawing Department'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'wire_drawing');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.wire_drawing.imageUrl);

    // Click Stranding Department -> dept-stranding-machine.jpg
    fireEvent.click(within(showcase).getByText('Stranding Department'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'stranding_machine');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.stranding_machine.imageUrl);

    // Click Finished Inner Wire Bundles -> dept-wire-bundles.jpg
    fireEvent.click(within(showcase).getByText('Finished Inner Wire Bundles'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'wire_bundles');
    expect(activeBgSrc()).toBe(SCENE_PRESET_MAP.wire_bundles.imageUrl);
  });

  it('dynamically assigns matching 3D scenes when a 5th or 6th division or department is added via Company Settings', () => {
    render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>,
    );

    const bgContainer = screen.getByTestId('welcome-holographic-earth-bg');
    const showcase = screen.getByTestId('welcome-lifecycle-showcase');
    expect(within(showcase).getAllByRole('tab')).toHaveLength(
      DEFAULT_DIVISION_LIFECYCLES.length,
    );

    // Add 5th and 6th divisions dynamically without code changes
    act(() => {
      useCompanyWelcomeStore.getState().addDivision({
        id: 'div-5-spring',
        code: 'DIV-SPR',
        name: 'Precision Spring Division',
        departments: [
          { id: 'spr-1', name: 'Raw Wire Coil' },
          { id: 'spr-2', name: 'CNC Spiral Coiling Department' },
          { id: 'spr-3', name: 'Tempering Furnace' },
          { id: 'spr-4', name: 'Dispatch Department' },
        ],
      });
      useCompanyWelcomeStore.getState().addDivision({
        id: 'div-6-fastener',
        code: 'DIV-FST',
        name: 'Industrial Fastener Division',
      });
    });

    expect(within(showcase).getAllByRole('tab')).toHaveLength(6);

    fireEvent.click(
      within(showcase).getByRole('tab', {
        name: /Division 5: Precision Spring Division/i,
      }),
    );

    // Select Tempering Furnace in 5th division -> automatically inferred 'annealing_prep' scene!
    fireEvent.click(within(showcase).getByText('Tempering Furnace'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'annealing_prep');

    // Dynamically add a new department to the 5th division
    act(() => {
      useCompanyWelcomeStore
        .getState()
        .addDepartment('div-5-spring', 'Chrome Electroplating Department');
    });
    fireEvent.click(within(showcase).getByText('Chrome Electroplating Department'));
    expect(bgContainer).toHaveAttribute('data-active-scene', 'electroplating');
  });

  it('allows adding a 5th division directly inside the Company Settings WelcomeDivisionSettings UI', () => {
    const Wrapper: React.FC = () => {
      const [portal, setPortal] = React.useState<WelcomePortalConfig>(() =>
        normalizeWelcomePortalConfig(DEFAULT_WELCOME_PORTAL_CONFIG),
      );
      return <WelcomeDivisionSettings value={portal} onChange={setPortal} />;
    };

    render(<Wrapper />);
    expect(screen.getByText('4 of 4 Active on Welcome Page')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('add-welcome-division-btn'));
    expect(screen.getByText('5 of 5 Active on Welcome Page')).toBeInTheDocument();
    expect(screen.getByText('Division 5')).toBeInTheDocument();
  });
});
