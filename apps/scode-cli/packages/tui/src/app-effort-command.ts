import React from "react";
import {
  effortCommandQuery,
  filterEffortOptions,
  reconcileEffortCommandSelection,
  selectedEffortOption,
} from "./app-input.js";
import type { EffortCommandSelectionState } from "./app-model.js";
import type { TuiEffortOption } from "./types.js";

export function useEffortCommandController(
  draft: string,
  effortOptions: readonly TuiEffortOption[],
  listEffortOptions?: () => Promise<readonly TuiEffortOption[]>,
): {
  filteredOptions: readonly TuiEffortOption[];
  reconcileDraft: (value: string) => EffortCommandSelectionState | undefined;
  selectedOption: (submittedValue: string) => TuiEffortOption | undefined;
  selection: EffortCommandSelectionState | undefined;
  setSelection: React.Dispatch<React.SetStateAction<EffortCommandSelectionState | undefined>>;
} {
  const [liveOptions, setLiveOptions] = React.useState<readonly TuiEffortOption[]>(effortOptions);
  const [selection, setSelection] = React.useState<EffortCommandSelectionState | undefined>();
  const active = effortCommandQuery(draft) !== undefined;
  React.useEffect(() => setLiveOptions(effortOptions), [effortOptions]);
  React.useEffect(() => {
    if (!active || !listEffortOptions) return;
    let cancelled = false;
    void listEffortOptions()
      .then((options) => {
        if (!cancelled) setLiveOptions(options);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, listEffortOptions]);
  React.useEffect(() => {
    setSelection((current) =>
      active && liveOptions.length > 0 ? (current ?? { selectedIndex: 0 }) : undefined,
    );
  }, [active, liveOptions]);
  const filteredOptions = React.useMemo(
    () => filterEffortOptions(draft, liveOptions),
    [draft, liveOptions],
  );
  const reconcileDraft = React.useCallback(
    (value: string) => {
      const nextSelection = reconcileEffortCommandSelection(value, liveOptions);
      setSelection(nextSelection);
      return nextSelection;
    },
    [liveOptions],
  );
  const selectedOption = React.useCallback(
    (submittedValue: string) => selectedEffortOption(submittedValue, selection, filteredOptions),
    [filteredOptions, selection],
  );

  return {
    filteredOptions,
    reconcileDraft,
    selectedOption,
    selection,
    setSelection,
  };
}
