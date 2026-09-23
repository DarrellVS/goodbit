/**
 * Pictures the analysis knows by shape.
 *
 * Each one is a greyscale patch cut from a real recording at a reference frame
 * height of 1440, stored as base64 so it needs no image decoder and no file on
 * disk beside the bundle. They are matched by normalised cross-correlation (see
 * `match.ts`), so only the shape counts and not how bright the scene behind it
 * happened to be.
 *
 * Cut from Battlefield 6 footage at 3440x1440, from frames whose content was
 * confirmed by eye first. `scripts/visual-kills.mjs` is the bench that
 * established them and the thresholds that go with them.
 */

export interface Template {
  width: number;
  height: number;
  /**
   * Row-major grey values, 0-255 as decoded; a derived template (see
   * `highPass`) holds signed values instead, which the matcher does not mind.
   */
  data: Uint8Array | Float64Array;
}

function decode(width: number, height: number, parts: string[]): Template {
  return { width, height, data: new Uint8Array(Buffer.from(parts.join(''), 'base64')) };
}

/**
 * The skull heading Battlefield 6's own kill confirmation, under the crosshair.
 *
 * Averaged over three confirmed kills, so no single clip's background becomes
 * part of the shape.
 */
export const BF_SKULL = decode(64, 64, [
    'KSktKykoKi0yMzIuMTQyMzg2LiwtJyEmLSwrKywrKyorKiosMDU3NjIvLzAvMjc8PDk0MC4tLSwVExUTFRQQChwWHCw5OS8q',
    'JyUnKCotLS0yMysmKS0wNDY0LykoKisqKy0uLjE5PTYrKC40Njg7ODQwLysqKisyIBUVEhMTDwopHhwoLy0qJyEeIyorKSgo',
    'Ki0rJSMtNzk0MjEvLCsrJygvODcyMS8tKy0wNDc3NjEvLy8tKy0wNykVEQ8NCwoHMjIuKyQhJiglJSoyNC0rKywsLSgkKDAz',
    'MC4wMDAxLysnKTM2Mi0qLC8vMTI0NDIuKy0wLy8wMjovFAwNCgsLByowMjIvLzM0MjEyNDQyMjQyMDIyLSorLzIyMjU1MDE0',
    'Mi8uLi0qKzA0NDMxLS4xLy0wNDU2NjY6MhUMEA8PEg4kKDJBSEI6OTUwLy8xNjo3LysvMjAtLC40Pj43MCwtMDMyMC0rKy81',
    'OTg2LygqMTEvMjY5OTg3OTQXDRITExgTKC85Q0IyJSsyMTU5PEA+MSYkJigoKissMDw6LystLS4vLi0tMTY5ODc0MC0sLzMx',
    'MDM0NDQ1Njk6IRETExQaFzA2NzAtKykwNzk8PTc0LysoJCUmJScrLTAyMCwsLS8wMjAtLzY7OTYwLS40NTQzMzQ2NTIwNDg9',
    'Qi0TEA4QExMtNjw3OUNANjAvLSsqKCs0NTIxLy0uMzY3NjIvKystMjQzMjQ1MzEvKyYwPj43Njk7Ojc0Mzc9QkIwEQ4ODxAR',
    'KzQ9RkhBNCgmKSgrMTQ1OT0+OjY0Njo/PDYyLywtLzAxMjI0MzIxLy0qLTY1LzQ2NzY1MjQ4OzYxLRgTExEREzYtJzQ5LCcq',
    'LzEyNDw/OTQ3PTk0NDc6OjUwMC8vMDIyMTAvKzA0NjQxLisqJB8qMjIyMTEzMzEqKi4iFhUTExUvKh8bIiosLjI1Njg7OzYy',
    'NDY3NzY1NTIvLjAwMTIzMS4tLjAwMzY1MjAuKyQiKDExLy0vMjMvKiotKBcTExMXHBoaISkwMS8xMzQ3ODg5NjY7Pj02Liwr',
    'KyswMjQ1My8sKy8wMDAyNDQyMSwmKC4yMS4tLS4rKisvLy0VERMXGSEiJSYoLS4sLzM0Mi8xOT8+Pj46MiorLy8rLTAyNDIv',
    'Ky00NjYzMjI1NjQzMDE0NjMxMTEzMjQ2Nzc0GhMXGRksMCojIyssKSw2MjEvLjI7Pjo3NjIsKzM3MC8wMjY2MzAtMDI0NDQ0',
    'Njg5Nzc3OTg1MjAxLioqMTc3NB8VFxgWLC4nIScvLCQlKisuMy0lLTYyMjQ0LioyOzUwLS8yNzg3MzIyNDY2NjY2NzY2NjU1',
    'MzIzMjAsKiosKi8gExMWFSwvKCQqMjAqKiooKC8pIyctKisvMzAtNkNZUU1LTFBUVFFPU1VLRT0zODQzMjI0NjUzMCwqKyws',
    'LSo0JxIQFhcwNDAqLTY6Ozs4MSolJSQkJikpKy8yQWWLlqShnpudoKSkoZ+dmYh5UDo0MzY7OzkyKygoKS0uLy8xNy8WEBcZ',
    'LTQ4ODg7OTU1OTgxJisxIx4rJiUvTYGrzc7Y1tPOzM7S1NPR0c7Jv55lNTQ7QTswKystMDExMTEzNDkzHRIVFzE5QUA8ODAm',
    'JjE0MS42NyYeLDEyS468ycjJyc3OzMbFxszOzczMzM/Fp3A4NjYvKistLzIyMTIzNjY9OyUUFBY5Pz04NDQxLC4zNDA1Pjkt',
    'KS83aZrLz8nJ0b7L2NrV0dHX2tra2tjW0s3BeEc0LyosLy8rKiwxNDc7PzwrFBIVOz44MzM0Njk5ODcxNDguMTYwZaPJxsfL',
    '0Nvr9fb19vb3+Pj5+Pn5+Pb047+DQDEtLi4tKScoLTQ4Ojs5KxMSFTk6ODQ1Njk6NjM0MDAvKjA6VKjEw77E1eTy9ff39/f4',
    '+fn6+fn7+/z7/fjiw302MS8tLCooKCovMzU1NC4YEhUzMjEwMzg5NS8xMTExMjI2O5HNy8TD0un3//r5+ff4+Pn5+fn4+Pn5',
    '+vn49ujJUTAvLy8vKickJSotLzEyIBISLi0vLzM5OS4qLzQzMjQ8Pk3C09HN1+r3+vr6+fn4+Pf39/f29ff3+Pn6+vf295gr',
    'Ki86OTcxKSYrLi82OSoTDi8zNjQ0ODYtKCstMjEvNjl3zszQ3O/29/f49/b29vb19fX19fb3+Pj5+fn5+PvvYScpLTY5NCoq',
    'NDU2OzwvEwwyNzYwLTAzMiwoJy0tKihKs8XL1Oz89vL39/f29vb19fX29/f4+fn5+fn4+fn7/LY7KB8eHRwbJTE4ODk3LhcN',
    'Ljs2LywtMjMuLCwuLCovks7Uy+f3/Pn3+Pj39fb19fX29vb29/j5+Pn39vb5/P3eXDgsKCQlKiwwMTQxMC8YDiEpLzAvLzIt',
    'LDM1NC4xQ6/VzMj0+vn3+Pr49/b29vX29fX19fX29/f39/b29/r8+Y8+LTQ0MjIyMiwlIyUlFxEjJCgxLCYsLiwvMjExOVG3',
    'ycbX+fn39/j39/f29vb19fX19fX19fb39vf39/X5/Pu2SikqLC0xNDo7MiUfIhoVKSQmNDQoKjIzMC8uMzlGssfF8fr39vf4',
    '9/b29fX19fX19fX19fX19/f29vb19vn7sFI9MTIzNDU0MjEzNDEgFykkISgzMy80Ozo1LjArNrPSy/n49fX39/b19fX19fX1',
    '9fX19fX19fb39fX18/X4+pNcTEBEPzk0LigpLzY8MBwoLSMaJCosNDw4NSMnKCygztX49vP19/f19PX19fX19fX19fX19fX3',
    '9/b09PL09/h5W0ovNDcyMTIyKykvPDcjKjk0LCopLzY0MS8eJzYxjcXZ9/Lz9vf29fT19fb29vb19fX19fX29/f29fPx8/b0',
    'bVlKIyEuLS80NjQ0NzcpICg0NjgzLjYzKzIvKC41MXbHy/Dy8/X39/b29fb29/f29vb29vb29/f39fXz7+/17mlYTCUhMS4v',
    'NTk8Ozs+MiAhJSgtKyQlIyg6NTEoLjFZzLzs8vH09ff39vb29/f39/f39/f39/f39vXz8u3m9NZlWk0lHyImMjU5Ojs8PTYm',
    'JSgmKC8lGSEyOTUsIjI4P8ey5fTy8/b39fb19/f39/f39/f39/f39/b29PPtw/PJYVpMJSEnKjM1OTMmJSYjKC84LyYtLCYw',
    'OC4oLzE/Oi27t9708/b29vP19vf39/f4+Pj4+Pj49/j4+vTy7aDrt1pbSSslHyEzNjgyIh8lJSYxOTYqISQsLyooITE7LyYg',
    'p4/Y9/XZ1uHk8PT39/f39/j49/f39PHt49Xz8euS1ahZXUU3NSwsOTgxOj84LiYkMzA0MSktMSgjKiQmLR4bHH1Tz/TFjoGP',
    'lp2z4vf39/f29/f30bCflI6Rve/ulKmYWFxCNDMwMDY4NTk4MzItIygzNC4yPDgsKi4qICQjJihRTs7wmF5aWFVVXqj19/n3',
    '9/T26o5oWVtcYHPq8KR8elVYKyYnJSk1OzcmKThELhoYLS4jJjEzLy8zLiQiKjQyK37J7IxfWVdSU1hx5fX3+ff19cFXWlpa',
    'WFpc4u/GdltRVCMoMC8zODkuHTE4KhoVGh8gHRwjMC8rLy0qISw2LU2sytyWWFNIPj1XWdf19ff39fSUW1paWldXTs7i66FX',
    'SlAxMDY2MyojHDs0IxwhJToxJyYrLSspKCstIBwlLD+TusbOoVtOJSUrK0yr0/L49fLyrVhTRTcwMTa9xdvoiz89LS0yMjEv',
    'JhseHiAgGx0zNjQvKyonIyMjMSweGiB1y8HLzMuch047NUWRt73p9fHv8eiWWUNCT2uCyMrd9885MCsmJSUrKyESDhUeHxoa',
    'LTg5LygpKikoKCgvLSwnnMbGzNnx8tSbjIOUwMa/za/U8fHx7KOGi6K3xczN3fftSjAqJSMlKikeEBIUFBwvKi42NionLTEv',
    'LjAmISk3N4jDzdDr8/Lzx77AwcjIxqV3f+Ty8/TnysPHvLnCyd/362M+KyYjISEeFxIUGx4fHx4xNC4mKDE0LyopJiMqMjda',
    'ss3f9ff19MvCysvKxr+NYF+h7PL17tzQzdHOz9rs9bRhUDEqIx4aFxUTFBYXGRUVMS8oIygxNjMtJyYsNjIvNHTF8fj79/nv',
    '6ePc08jGaV1cetrz9vbt4NbW2+Ls9dR2XV5MODM3MR4VFRoaFRIUFTIvKigpLDI2NTExNDMvLS8+ovX29/T58fPz9PDt5KOF',
    'jZi37Pj49/X08vPv8diLW1peTjk4RT8jFRUVFxMMCwszMTEzLiwvNjo3NjQvLCwxMVy10dDN1Pn6+ff1+ffu1tDMz9ju+Pny',
    '2tbT0MGTX1xfV0I5ODg0KBwXFxIPDw4SMzI2ODYzMjg8PDgzKCgrMTMxW3mFhYW99Pb39fb39/PVy9LX6/f45I+Fg4WBbV9h',
    'WkIkIyMlKCYZDhAPDAwWKjQzMzQ2NTIzNjg0MS0sLjAxNC1CWGFhf/b69vf3+Pny0tDY4e72+NNgW1xZXF9fX00xKSMmMjwy',
    'Gw4NDg8ZLzE1MzEvLy8tLS0vMDExMC8vMDImMURTV1jd8vb39/f49uzg4+319e+XXFxcXl5eV1VKNTItLC0yLBoMDRUjMjMk',
    'LzIzMTAuLy8sKiwvMTEwLy8sLC4xO0E/ltbz9PX39/f39vb19fzidFxYTkdFQjw5NzMzNDMqJSIZDxksNi4fGSwxNjk2NDQ2',
    'LSUlKi4rJyYpLTAtLC8xMlSkzer1+Pf49/b27+jYqF9cUzYwMDEzMzMzNDQzMSogGhkoLCceGRkuLjE0MS8vMSwiICcqJRwb',
    'Iy8vLC4wMjE0WnqfrdHv8vPixamflHdcX1AqKCkuMzM0NTQ0MzQxKiUnKSUeGxoaLyopKygmKCwsJSMnLCojISQoKi4yLy0w',
    'LzE0W2CHnKGjmHxbVVpcWlxLLS8xMTIyMjMzMzMxLy8vLCYlIBwbFjIvLS4uLCosLSonKCwyNS8mISYqKigoMTEuL09UWF1d',
    'W1xcWl5cW1hWPjQ2My8vLzEvLzEwLSstLy0gHh0bFAk0NDIwMDAvLi0sKiktMzY2LyglJiYjKDM5LSwyPkxRVllbXl9eW1dH',
    'OzYuMTEtLC0tLTAxLSsoJiQZGxwbFAsOMTczMTMzMy8tLC0sMC8rLzc4My0tLy4qKCgqLC0vMztMW15aST84Ly8wMC8uLy0s',
    'LTEzLispJiMXFxsgFgcKIicvMTQ1MzEvMTg2LispJSgzOzkyMTc2KycoKCoqLC4uJiUnLDE2MykoLS0sLzAvLjEzMC0qJiIX',
    'FhYcFggLHi8wMzg8PDMuLi82NzAtLy8vLzEzMDA2ODYzMS8vLSstMTAnIyYtMS4gICgsLS4vMDMzLy0sJyIXFxQTDQYJHy0j',
    'PT0+Pz48NCkmKjAxMTU4ODIwMDA1ODYzMzM1NjQwMDU3Ly8xMTEuKSguMTExMzU0Ly0sKiMXGBgWCwAIHCghFw==',
]);

/**
 * The boxed word KILL from the label row under that banner.
 *
 * The skull alone is not enough. Battlefield draws skull-shaped icons for
 * assists as well, and any round icon, a clock for a sector, a helmet for a
 * spot, correlates with a skull well enough to matter. The word does not.
 */
export const BF_KILL_LABEL = decode(72, 44, [
    'HhkTEBIUFBYaHRwdICEfHx8gHx8fHx8eHh4fHxwZGBwhIRsYGRodHx4dHR4eGB8fHh0eHh4dGxoaGRkaGxkYGBcYFhAKCQkK',
    'GhUQDxIWGRoaGhwgIyIhHx8eHR0eHh4dHR4fICIkJCMhHRoYGR0fHx4eHRwbGBobGxscHh8eHh0cGxsbGhoZGBcVFRMKCQkJ',
    'FRMRExcaHBwbGxwgIiMhHx0cGhodHx8eHh8fISIjIyIgHhwbHBwdHh8eGxoZGRkZGRoaGhoaGRkZGRkaGhkYGBgWFRQKCQgJ',
    'ERIVGBobHh0cGxwfISIhHx0bGRoeIB8fHx8gISIiISAgICAhHx0cHB4eGhgZHR4dGhkZGRkZGRoaGhoaGhoaGhkYFxcKCAgJ',
    'EhQZHhyPmZSRkJKVmJmYlpSQjY2QkpKRkZKTlZSTkI+Qk5mal5aUk5KRkZGRkpKTk5OSkZGRkZKTlJSUk5OSkpGUkZk1BggJ',
    'FRgcHx+WiYWFhYWGhoaGhoSDgoGAgICAgIGBgYB+fHx+goeJh4aFhISEhISEhYaHiIiIh4aGhoaHh4eGhoWEg4KEg5g1BggI',
    'GhwdHh+Oix4gISAeHR0eHh4eHx8fHx8gISEhICAgHx8gISIhHhwcGxsbGxwcHBwcGxsbHBwcHBwbGRkYGRobGhkdMqE1BggI',
    'HB4eHh+RjR0fISAfHyAiIiIhISIkJSYnKCgoJyYlJygoKCYjHx0dHBwdHR0dHR0dHBwcHB0eHh0cGhgXGRsbHBwaLZU1BggI',
    'HR4eHiCUjB8iIyMiIiMmJiUiISMmKCkqKisrKigoKy0sKickIiEgICEhISEiISEhIB8fHx8gICAfHRoaGhsaGhkaL581BggI',
    'HB4eHR6UiB8jICEhJCYnKScpLSsqKistLi0rLS4wLC0uLSssKyUoJiUlJiUlJSUmLCEiIyMiIiEgHRsaGhwcGhkaL543DwgJ',
    'HB0eHR+ShB8hHyIiJigqLCstLy8uLi4xMjIuLzE1MDEyMC4uLScqKCcmJycnJykpLyUlJiYkIyIhHxwaGxwbGRkaMJ44EAgI',
    'HB4eHSKTgyAfHiIjJyotMC8wMTMzMzM1NjYzMzY7NTY3NDIxLiosKSgoKSkqKissMSgoKScmJSQiIB0bGxsbGRkaMZ04EQgI',
    'HB4eHSCUgyAeHCMjKS0wMT1ANjc2NTc4QkpFPURLQz47OjtDQTAtKykpKissLS4uQjgtKyknJiUjIR4cGxsbGRkaMZ05EggH',
    'HR4eHR2UgiAcGyQnLTAxOHqMUDs4OT1EZIGAVEmEjFc/PkOAf1IyLCopLC0uLzA2dXVHLyspKCYkIR8cGhoaGRkaMZ04EgkH',
    'HR4dHSCUgiAaGiYrLzE2RZegXD48PkNZiJmEVEqerWBBQUaUols1LSsqLS8wMjRAmJ1gNy0rKSclIh8cGhoaGBkaMZ04EwkG',
    'HR4dHCOUgyAZGigrMDM7SZicWT8/Q0hxm5VcSE6bp1xCREiVoVs4MCwrLzEyNDdAmp1bNy4rKigmIyAdGhoaGBkaMZ03FAoG',
    'Hh0cGyCUhB8XGiosMjQ7RpmdVkFDRU6Bnn5MSU2VoVtDRUmWn1o6Mi0sMTQ1Nzo+l51WNS4sKyonJCAdGhoaGBkaMZ03FQsG',
    'Hh0bGhuUhhwWGistMzU+SJ2fWENFSHGemWBFSE+ZpF5FREyYn1s8NC8tMzY2NjxDmZ5ZOjAtLCspJSEeGxoaGRkaMZ02Fg0G',
    'Hx0aGRmUhxoWGywuNDdASJ6gWUVISommfE1ESFCaomBGRU6ZnVs9NTEuNTk4Nz5EmZ1ZPTIvLi0qJiIfHBsbGRkaMZ02Fw4G',
    'Hx0aGRiTiBsWGy0uNDlBSZ6gXEVLdJyZZUlESFGbomFHRk+bnFs/NzIwNzo5Nz9Gmp1aPzQxMC8sKCQgHRwcGhoaMZ02FxAH',
    'IB0aGReTiRwYGi4vNDpCSZyfX0hNiZ54U0hFSVKZoGFJSFGbm1xAODUyODs6OEFHm51aQDYzMjEuKiUhHh4dGxoaMZw2GBII',
    'IB4bGhiSiB0ZGS4vNTpDSZueiY6bnJVnTkhGSlOYn2JKSVOcm11BOTc0Ojw7OUFIm51bQjg1NDMwKyYjHx8eGxsaMZw3GBUJ',
    'IR4cGxqRiB0aFy4vNDpDSpednKqqnpJnTUhHSlOXnmJKSlOcm15BOzg2Ozw8OkJJm51bQzk3NTQxLSgkISAfHBsaMZw3GBcK',
    'IR8dHByQiBwaFy4vMzpCSpaddGV4mJptT0hISlOWm2NKS1Scml5BOzo4Oz08O0JJmp1cRDo4NzYzLiklIiEgHRsaMpw3GBgL',
    'IR8dHR2RiBsaGC0tMjlBSpSeZVJYd5mLWElJSVKXm2NJSlOcmWBBPTs5PT09PUNKmZ5dRDw5ODc0LiomIyIhHRsaMpwzGBgM',
    'IB8eHx2RhxsaGisqMDVASpSeXkhNYZebdE5HSFGYnWJISFKcmV48Ozs8PD0+PkNLmJ9jRj47OTg2LCsnJCIhHRoaM5w0FxgO',
    'Hx8eHxyRhxobGykoLzM/SpSeWkVGUHKYmV9KR0+ZnGJIR1GcmWhBQUFBQUA/QENMlZ9mR0E+PDo4Mi0oJSIhHhoaNJw1FhgQ',
    'Hx8fHhuRhhobGygoLzE9SpWeWENBR1Gal31NS06ZnGFHRlGcnXVQUFFRUlJRSUJNlKBnSk5PTk5NTTInJSIhHhobNJw2FhgS',
    'Hh8eHRuRhhobGycnLzA8SpefVkE7QUh+m5VgTU2YnGBGRFGcmpiRj46Oj4+TV0FMk6OUjo2LiYiGhUwvJiIhHhobNZw3FRgT',
    'HB4eHBuRhRobGyUmLi45SpmjVT82OkBXfp6TUUuZn19AQFCdnJycnZ2dnp6nVz9JlKScnJ6cmpmXkkwqJiIhHhobNZw3FRcV',
    'Gx4fHRuRhRkbGyMmLSwzPnd7Sj40NjpAWX52UUV3d1M+PT97enp5eXh4eXl8Uj1CcH93fHt7eXd1ckkzJiIhHhobNZ03FRYW',
    'Gh4fHRyRhBkbGyElKikwLDg4Mzc1MzY5Pjw7Ozw/OUE9OzdCRkZGRUVEQkE+Oz4/SUlAQD8+PTw7NjIsJiIhHRoaNZ43FRYY',
    'Gx8fHRyRhBgbGyAkKCYrKzMyLi8vMDM1NDkwMTM2Lzk2NTI4ODk5OTk4ODg3NjY0ODozNTY2Nzc2LiwpJSIhHRsaNaE3FRUZ',
    'Gh8fGx2PhBgbGx8jJSUoLCwtLCssLTAxMTAvLy8vLy8vMDAxMTIyMjIyMzIyMjIyMjIyMTEwLy4tKykmJCEfHBsbNqg2FRYa',
    'Gh4dGRyPhBkcGx8jJCQlJygoKSoqLC0tLSwrKywsLCwsLC0uLy8vLy8vLy8vLi4uLy4uLi0tLCsqKSYkIyMiHxwXNpw2Fhca',
    'Gh0cGByPhBocHB4hICEiIiMkJCYpKSkpKCcnJykqKSkpKSorLCwsLCwsLS0tLS0tLS0tLCwrKikoJiQhHh0dHR4aNaA2Fxga',
    'Gh0cGByPgxscGxscHBwcHR0eHyEjIyMiIiEhIiIjIyIiIiMjIyMjIyMjIyQkJCQlJSQkIyMiISEgHx0dHBsaGxsbMJ42Fxga',
    'GRwbGByPghscGxobGhobGxscHR0dHR0dHR0eHyAgICAfHx8fHh0dHR0dHR0dHR0eHh4dHRwcHB0dHBsaGhobGxsbN6E2Fxga',
    'GRwbGB2SgxscGxkbHBwcHBwcHR0dHR0eHyAgISEgICAgICAfHx8eHh4eHh4eHh4eHh4fHx8fHx4dHR0cHBsYGR4ZOp03GBga',
    'GRsbGRyYlJaYmJCUlpaWlZSUlZaXlpaWl5eXl5aVlZaXmJiYmJeXl5eXl5eWlpaWlpaWlpWVlZWVlpeXl5aVlJWbnJs3GBgZ',
    'GhobGh6GjIGEgX+CgoKBgH5+f4GBgYB/f359fX19f4CBgoKCgoKCgYGBgIB/fn19fX19fHx8fH19fn5/f4CAf35+gX04GBgZ',
    'GhobHR8fHRsaGRkZGRobGhgZHB8gHx8fHx8fHx8fHh4eHh4eHx8fHx8fHx4eHR0eHh8gHxwYHB4XFR0fGBYbHxwXGBwbGRcY',
    'GhobHh8fHRsZGhoaGhscGxgZHB8fHx8fHx8fHx8fHh4fHx8fHx8fHx8fHx4eHR0eHh8gHx0ZHB0XFx4fGBgcHhsZGhwaGBcY',
    'GxkbHh8fHhwaGhsaGhsbGxkZHB8fHh4fHx8fHx8fHh4eHh8fHx8fHx8fHx4eHR0eHh8gHx0aHB0XGSAeGBodGxocHBsaGBcY',
]);

/**
 * MAN DOWN, the line under the revive ring in the middle of the screen.
 *
 * Averaged over three confirmed deaths. The words are drawn in the game's own
 * thin condensed face over whatever the camera is looking at, so unlike the
 * PLAYER CARD prompt below there is no dark plate behind it and the contrast
 * varies a great deal: one of the three was averaged in half faded.
 */
export const BF_MAN_DOWN = decode(152, 26, [
    'TUhHRkhMT09PUFBQUE9PTkxHSUpMT1FRUlJSUlFRTU1NT1JTVFRUU1JQTEpKSlBSUlJTUlJQTExNT1BTU1NUU1NSUE9PTk1K',
    'SkpKS0pKSkpLTE5QU1RVVldWVVROTEtLS0tLS0xNT1FRUVFPTExOUFBQUE9QT01MTE5QUlNUVFNSUE1OT1BOSklLTU5PUFBR',
    'UE5LSEdJTFFKR0ZGRkhMT09PT09PT05MRkdIS0xNUFFRUlFPTUxKS0tNUFNUVFRTUU5KSEhGSlBSU1NTUk9LS0xPTlNTU1NT',
    'U1JQT01JSEdISEhJSUhISUlKTE9SVVZWVlVTTUtJSEhIR0dISEpLTk9QUE1JSkpNT09PTk5LSkpLS05TVFVVVFBNTE5OTkpJ',
    'SUlLTU5QUVBPTEhFREdLUElGnJuanEpNT09PT09OTEZZl5qdj0tQUFFRUE5MUp2dnZxyU1RUVFNRTUmanZyNS1FTVFRTS0md',
    'nZlMVFNTU1NTUlFQTUdHlpqcnZ6enZ2cm5qZUE9VVVRVUkxJTJudnZ6en56gnW9LTE1NS5mdlG9NT09OSklgmp2fZlNVV1dT',
    'TX2boaJKSqCenp1NTU9QUE9JRZ6ck0lQSEWdnZuabE1OT09PT01HRpeZnJuRSVBQUVFPS0pon56dnZxRVVRTU1JMSZycnJxa',
    'TFJUVVNKSZycmUtUU1NTU1NSUVFOSkqanJ2dnp6enp6enp6eV1NUVFFNSU6fn5+fn5+fn5+hnptLS0xMcpqck0xOT01KSI2e',
    'oKCZUldZWVFOm6GhdU1MoZ+fnllNT1BQT0ZEnp+UR1BHRZ6dnZubTk5OT09OSEZPmZyam5RIUFBRUE5JSpqcnZ2dnVdUU1NT',
    'UUtInZ6dnJxPUVNVU0pInZyZSlRTU1NTUlJSUU9KSpycnJybmZmam5ydnZyZUVZRTUlJmZqampqbmpubnZ+hnptLS0tgnpqc',
    'TE5OT0hGlqCgoaJVWVxbU0+ioqJdT06hoJ+enkxOT09PRUOenZVIUUZFnp6dnZtpTU5OTk5HRpmcm5qblUhQUFBQTEhMnJyd',
    'nZ2dZ1JSU1NSSUienp6dnFlQU1RTSkmdnJpJU1NSUlJSUlJSUEpJnZ6fSUpMTExMS1mcm597UU5KSJicmppUSEhHRkZHZaCh',
    'n2dKSkyfnZpTT05NR0acn6CgoVddXVxVVKOjoFRST6Kfn56fV05OT09FQ56dl0hRRkWenpydnJlMTU9PTUVLmpuanJ2WR1BQ',
    'UFBLR2WdnJ1unZ2TS1FSU1JIR56enqCgmlBSVFRLSZ6cm0lUU1NSUlFSUlJRSUienp9KVFNVVVNTSlugnZtNT0lHm5ycWVRU',
    'U1RTU1NKZaCelUhJSJyenmNPTkxGYJ2enp+gbGBmZVh1paSgXFNPop6dnJ+cR0tPT0dEn56YSFFFRZ6fmpycmllKTk9IRWyb',
    'mpmcnZdIUVBQT0pHm5+cb1SdnZpKUFFSUUdHnZ6eoKCeXVBTVEtJn52bSVRTU1JSUlJSUlJJSJ+gn0tUVFVVU1JJSp6dnUtQ',
    'SUabnZtKVFRUVVNTUkpKn5+WR0pIlZ6eb0xNSUVsnp+UnqJ1YWZiW3+mpJ5cU06inp2an55USU5PSEShn5hKUkVFnp+ZbZuc',
    'mEpNTkZHm5uYXZycl0dRUFBOSEicoJxVSJyem11NUVJRRkecnZx8oKCYT1JUS0mgnpxJVFRTUlJSUlNTUklIn6CeS1VVVVVU',
    'UklJnZydSVFJRpycm0tUVFRVVFNSSUmdnpZGTEdqnZ6UTE1HRpSenmCdop5haGBeo6WjdFxRTaGdnIGeoZdJTU9JRaKfmEtU',
    'RUaen5hKmpyaVkhMRWucmpdFnJyXR1BQUExIYJ2hm05Hl52clUxRUVFHRpycm06foJxdT1RLSaGenElVVFRSUlJTVFRTSUig',
    'oJ1LVVVVVVRSSUibnZ1JUUhGnJ2bSlRUVFVUU1FISJ2el0ZNSFCbn5lMTEdHmp6dSp2io2FrX16npKFgWk5LoJ2cT5uhnVdL',
    'TklGoqCZTFZERZ6fl0Zvm5uXSEZGmpyZYUSam5ZHUVBPSkiPnaF5UUhgnJyZTFBRUUdGm5yaSXegnpdPUktJoZ6cSVVUVFNT',
    'U1NUVFRKSaCgnUxVVFVVVFJISJqdnUhSSEacnZtKU1RVVVRTUUdInZ6YRk5JSpqemk5MRkmcnphJmaKiYmpeYKWinlVXSkif',
    'nZxGdqCgmUtNSEWhoJpMVkRFnp6XRlGYnJpRRWCbnJhFQ5mblkdRUE9HSZ2eoF1RSUmbnJpXT1FRR0ebnJlITJ6fm1xRSkmh',
    'n51KVVVVVFNTVFVVVUpJoaCcS1VUVVVUUkhImZydSFJIRp2dmkpTVFVVVFNRRkednphGT0pJl52bXkxFW56ee0d8oaBwZlly',
    'oaCaU1RIRp6enEVNnaGfWkpHRaGgmUxWREWdnpdGRo6cnHJHmpyaaUREmZuXR1JPTkZVnp6eSlBJSJeam3FPUVFIR5ycmkhK',
    'dJ+dl1FKSKGfnUlWVVVUVFRUVVVWSkqgn5xLVVVVVVNRSEeYnJ5IUkhGnZ6bSlNUVFVUU1FFRp2emUdQTElxnJtuSUV3n51b',
    'RFqgn3tYU3ydn3RTUUZFnZ6cREpyn6GZS0ZEoZ+ZS1RERZ2el0ZGVZqdmlianJpOQ0SanJdHUU5MR2menZdIUEtGYZqcmE5R',
    'UUhHnZyaSUtNnZ6ZXUlHoJ6dSVVVVlVUVFRVVVZKSqCemktUVVRUU1FHR5icnkhSSEadnptKUlNUVVRTUEVGnZ6aR1BOSGSb',
    'nJZJRZWgnE9ETp6dmVFQl52eZVNPRkSdnptESEqdoZ5cRkShnphKUkRFnZ2XRkhHmZydm5qaaU5DRZudmEdQTUdGm56dX0dH',
    'SEdLmp2bU1BQSUednZlJUE1xnZmfSEafnpxJVVVVVFRUVFVVVkpKn52ZS1RUVFNSUEhHmp2eSFNIRp6enEpSUlRUVFJRRUad',
    'nppIUU5JSZudmUlGm5+bSkVHnJ2cSkianZ1NUk9GRJ6em0VOSXCfoJtHRaGemEhRREWdnZdGTUddm52bmZhQTUNFnZ2XRlBL',
    'R02cnZpIRERFRESZnZxlTlBJSJ2dmUlSTk2dmZ9mRp6dnElVVVVUVFRVVVVWS0qdnJlKU1NTU1FPR0eanZ1IU0hGnZ6bSlFS',
    'U1RTUlFFR52emUhRT0pHmZybTk+bn5ZKSUaVnZ1TUZudm0xSTkZEnp+cRU9JSJygn2BGoZ6YSFFFRp2dl0dOSUmZnZuYkUxN',
    'Q0adnpdGT0lHbJydnJ2dnJ2dnJydnJlNUUlInp6ZSlRSTXOYn5lGnZybSVVVVVRUVFVVVVZLSpycmUpTU1NSUU5HR5qcnUhT',
    'SUednptLUVFSU1NSUUVHnZ2ZSVFQTEeUnJthbJydaUxNRm+cnmxXnZ2WTFJPRkSenptFUE9Ibp6hmEignZhIUUVFnZ2XR09N',
    'SGOcm5hZTU1DRp2el0ZOSEeYnZucnJubnJ2dnZ2dmk1QSUifnppLVVRPTZifm2qdnJpJVFRUVFRUVVVWVUtKnJuZSVJSUlFQ',
    'TUdHnJydSFJKR5ydm0pQUFFSUlFRRkidnZdKUlBOR3WbnHmSm5pVTk9GUZuek3aenHROUU9GRZ6dmkZQUEpGm6CdYp+emUhS',
    'RUWcnZZHUE5OUGBjX09MTENGnZ+XRktHSZqdm5ydnZ2en56enZ2bX01JSJ+fmktWVFNObp6cnJ2cmUlUVFRTVFRVVVZUS0qc',
    'm5lJUVFQT05NSEidmptJUkpHmpyZSk9PUFBQUFBHSJ2clktSUE9HWZudmpicmEtQUEdGm5+ZlZ6cWU9QT0dFnp2aRlFRTkZr',
    'np+bnp6ZSVNERZuclkdPT05OUE9PTkxMQ0WcnpZFSEZlm5yVRUZGRUdHR0d1nZ2aTEhHn56bTFZVVE9NoJ2enZyZS1RUVFRU',
    'VFVVVlNMS5ybmklNSkhHSEhHXp2ZmklRS0eZm5hYSUlJSUlJSUhpnpuSTVJQUEhJm56cnJyXS1FRSEaZn5ybnpxKT1BQR0af',
    'nJlGUVFPSkecn56enppKU0VFmpuVRk9OTk5OTk5OTExDRZyel0VHRZScm3VRUVBQUFBQTFidnp1NR0efnptMVlZVU05tnp+e',
    'nZpMVFRUVFRUVVVWUk1MnJybSEtGRUZHSFqanpiRS1FLSJCal41fRkZGR0hIaZqem2FPUlFQSUmanp6dnY1MUlJKRYyen52e',
    'm0pPUFBJR5+cmEdRUk9NR2qdn52emkpTRUWZmpRFT05OTU5NTk5MS0RFmp6XREZFmJuaWlFRUFBRUVBJSp2enl9GRp+em0xW',
    'VlZUT0qen56emk1UVFRUVFRVVVVSTUydnJyZmpmXmJmbnaCillNOUU5LTZmYl5WVk5SUlpqam56aUVBSUVFMSZmenp6daFBS',
    'UkxGZJyfnZ6TS1BPUElHnpyWSFJSUE5MSZqdnZ6aS1NGRZeWk0VOTk1NTU5OTUxLRkWYmplBRVucm5hLT1BRUVFRUE5Kl5+e',
    'dEVFnpybTVVVVlVVTWSenp2cUFNUVFRUVVVVVVJOTZ+fnp6enp2dnZ2dnZlcU1FQT09MTZybmpqbm5ucnZ2bik5RUVFSUVBM',
    'cJycnZ1VUVJQTUhRmpycnG9PT09QSkedm5NKUlJSUE9KaJqenJtNUUtGlJeSSk5OTU1NTU1NTEtLR5SYl0FFi5uZlExPUFFR',
    'UVBQT0xim52cREScmppQVVVWVVVNS5yenZpSVFNTU1RUVVVVU1BPm56fn5+enZycm5uZUlFRUVBQUE9LSpSZmZqampmZl2dR',
    'UVFRUVJSUk5ampubl09RUE9OSkmUmJmYW09PT1BLSJuZk0xSUlJRUE9KlJmck1BRTUtHR0lNTk5NTU1NTU1MTExMSUpLTUtK',
    'SUhMT1BQUVFRUVBRUU9ISlFST0pJUFVVVlVVVVNPTEpKUFJTU1NTVFRVVVVUUlBMTEpKSUhIR0hJSk5PUVBQUFBQT09MS0lJ',
    'SUlKSktNUFBRUVFSU1NTUlFMS0tMUFBPTk1MSkdHSUxPT09PUFFNS01QUVJSU1JRUE9KSkxQUVFNTk1NTU1OTk1NTU5OTU1M',
    'TE1NTk5OT05PT1BPUFBRUVFRUVFSUlNTU1RUVFNUVFVVVVVVVFNTUlJSUlNTU1NTVFRVVVVUVFRTU1NSUlFRUVBQUFBQUFBQ',
    'UFBQUFBQT1BPUFBQUFBQUFBQUVJTU1NTU1JRUE9QT05OTU1NTU1OT09QUFBRUlJTVFNSUlJTUlFQUE9PT1BQUA==',
]);

/**
 * The PLAYER CARD prompt in the bottom right, its key box included.
 *
 * The box around the F is deliberately part of the shape. Battlefield draws a
 * key prompt like this for several things, and the two words are what make
 * this one a death; the box is what stops the words drifting into a match on
 * their own letter shapes somewhere else along the same line.
 *
 * Averaged over three confirmed deaths, all of which drew it in exactly the
 * same place on a dark vignette, which is why it scores more consistently than
 * anything else this file holds.
 */
export const BF_PLAYER_CARD = decode(230, 30, [
    'IiEgIB8eHR0cHBwcHR0dHR0dHR0cHR0dHR0eICEiIiIiIiIiISEhISEhISEhISEhISAhICAgICAgICAgICAgIB8fHx8fHx8e',
    'Hh8fHx4eHh4eHh4eHh4eHh4eHh4fHx8eHh4eHh4eHh4dHR4dHR0dHR4eHh4eHh4eHh4eHh4eHh4fHh4fHx8fHx8fHx8fHx8f',
    'Hx4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0cHBwcHBwc',
    'HBwcHBwcHBwcHBwcHBwhJm94fH9/fXx8fH19fX18fX19fX1+f3+Af3ZvICIiIiIiIiIhISEhISEgISEhISEhISAgICAgICAg',
    'ICAgICAgIB8fHx8fHx4eHh8fHh4fHh4eHh4eHh4eHh4eHh4fHh4eHh4eHR0dHR0dHh0dHR0dHh0eHh4eHh4eHh4eHR0eHh8f',
    'Hh8eHx8fHx8fHx8fHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHR0dHR0dHR0dHR0dHR0dHR0d',
    'HR0dHR0dHR0cHBwcHBwcHBwcHBwcHBwcHBsbGyFzh42QkpSUlJWWlZWVlpeXl5eYl5iYl5aUkolzISIiIiIiIiEhISEhICAh',
    'ISAgICAgIB8fHyAfICAfICAgICAfHx8fHx8fHx8eHh8eHh8eHh4eHh4eHh4eHh4eHh4eHh4eHh4dHR0dHR0eHh4eHR4eHh4e',
    'Hh4eHh4eHh4eHh4eHx8fHx8fHx8fHx4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4dHR0d',
    'HR0dHR0dHR0dHR0dHR0dHR0dHR0dHRwcHBwcHBwcHBwcHBwcHBwcHBwcIneRlZWWl5eXmJiZmZqam5ubm5qampqYl5aWknYh',
    'ISIiIiIiISEhISEhICEhICAgICAgHx8fICAfICAgICAgIB8fHx8fHx8fHh4fHx8fHx4eHh4eHx4eHx8eHh4eHh4eHh4eHh0d',
    'HR0dHR0eHh0dHR4eHh4eHh4eHh4eHh4eHh8fHx8fHh4fHx8fHx4fHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4e',
    'Hh4eHh4eHh4eHh0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHBwdHRwcHBwcHBwcHBwcHBwcHBwcHBshc5OWlpaWl5eYl5iYmZmY',
    'mJiYmJeWl5eWlZSVciEhISEhISEhISAhIaCkpKKhoqOko6KedyIgHyAgIKOiooggHx8gIB8fHx8eHh4eHh8fRKOmpaagMx4f',
    'IZGin6F8JB8eHh4eHiaepqOfbR0eoKSkoqGhoaKioqKhoYMfHh4foaKioaGhoqSlop50IB8eHh4eHh4eHh4eHh4eHh0dHnWd',
    'oaGfoqCen3UeHB4dHR0eHh4eQZ+lpKOfLx0dHR0cHB0doKSlpKalpaGhoJ95HR0cHBwcHKChoJ+fn6Kfnp6flVUdHBwcGyJy',
    'lZeXlpaYlpmXl5eXl5eXl5eXl5aXl5aVlpVxISEhISEhISEgICEhoqWkoqGio6OkpKGdhyAgICAfpaOjiiAfHyAgHx8fHx8f',
    'Hh8fHh9+oaalpqZ1IB8fVqKjop4zHx8eHh4gcqWjpZYiHh6ipaWjo6SkpaWlpaShiB8fHx+jo6OioqGjpKWfoaKTHx0eHh4e',
    'Hh4eHh4eHh4eHRySnaChoqGhoqKgn5QeHh0dHR4eHh53pKalo6ZvHR0dHRwcHR2ipKeiq6emo6Ojo6CFHhwcHBwcoqOioKCg',
    'oaCfn6CdoFweHBwcInGWmJiXl5eWAQAAAQEBAQEBAQGWlpeXlpaWlXEhISEhISEhICAgICKjpaSioaKmoqGhoqOgiSUgHx+l',
    'pKSLIB8fIB8fHx8fHx8eHx8fIZ6kpaanqo0iHx8hkaOipIYgHx4eHySdpaWkZB8eHqKkpKOjo6OkpaWmoJp8Hx8fH6OjoqKi',
    'oaKiop+foqOUHx0eHh4eHh4eHh4eHh4alaKdpKSkpKSjo6Kin5AfHR0dHR4eH52lpKWkpZIgHR0dHBwdHaOkpp+ko6alpqSj',
    'pKKIHhwcHByio6Oin6KioqGipKGhpVQeHBsicZeYmJeXmJYBAQEBAQEBAQEBAZSWl5eXlpaWcSEhISEhISIhISEgIqOlpJVw',
    'aXBxdYqjoqGgciEgIKWjpIsgIB8gIB8fHx8fHx8eHiE2pKKlpaWmoioeICBFoKSkn0AfHx4fdaGoopggHR4fo6Sin314dXVz',
    'c3R/dVEfHx8fpKKhnHlxb215h56ioqN5HR4eHh4eHh4eHh4eHmqiop2ckH55fHiCoKOdm3UdHR0dHh84oKSjpKOioScdHR0c',
    'HB0do6SllWpodXqAiKKjoqRuHBwcHaKio5p0c3N0d32JoKCjnCUcHCJxl5iYl5eYlgEBVoGDg4KCg4SDkpWWl5aWl5dyIiEi',
    'ISEhISEhICAioqOikCEgICAgImWfoKSgISAgpaSljSAfHyAfHx8fHx8eHx4eInKloqOipKSjaR8fICCFpaajkCIgHzqbpKWd',
    'Tx4eHh6io6CTHh0fHh4eHx8fHx8fHx+loqKTIB8eHh0eaaGio5odHh4eHh4eHh4eHh4emqGhnWwfHx4eHh5opKGhmB0dHh4e',
    'Hnymo6Ogo6Cjbh4dHR0cHB2jo6SQGxscGxsda6CeoZwbHBwcoqGhmh0dHR0cHB2XoaKgcR0cInCWmJeXl5iWAQFskZKSlJSV',
    'lZWVlZaWlpaXlnEiISEhISEhISEhICKio6GQIiAgIB8gJ5Ofop8hISCko6WNIB8fHx8fHx8fHx8fHh4il6OgoH6jo6SaISAg',
    'Hi+epKOnVSEfiKGloocfHh0eH6KjoI8eHR4eHh4eHh4eHh8fH6SioI0fHx4eHhwemqKkoh4eHR0eHh4eHh4eHh6hoKCbHx4f',
    'HR4dHh2eo6SiHR0dHR4gmqKin4mho6GXHh0dHBwcHaOjo44cHBwbHBsdm6ChnRsbHByioaGPHBwbGxsbGzmioqGAHBwhcZaY',
    'l5eXmJYBAWyRk5SUlZaWlZaWlpaWlpeWcSIhICEhISEhICAgIqGioI8iICEgICAjlJ6gnyIhIaSjpI0gHx8gHx8fHx8fHx8d',
    'HzacpKKeKaGio6AhIB8eIm+jpqabIkafpKaiNR4eHR0fo6Sgkh4dHh4eHh4eHh4fHx8fpKGhjx4eHh4dHR2XoaSjHh4eHh4e',
    'Hh4eHh4eHqKhoJgeHh8fHh8eHWFwdWwdHR0dHjSioaGcJaCjoaAiHR0cGxwdpKOjjRwcHBscGxyanqCcGxsbHKKgoYwbGxsb',
    'GxsbIKSinocdGyFwlpeXl5eYlgEBa5CTk5OUlZaVl5eWlpaWl5ZxISEhISEhISEgICAioqOhkSIgISEgITucn6GfIiAhpKOj',
    'jCAgHyAgHx8fHx8fIB8gc5+goosikqKkomMgHx4fIpukpKFnkKOmpngfHh4dHR6kpaGWHh0fHh4eHh4eHh4fHx+knqCOHh4e',
    'Hh4ePp2hpKEeHh4eHh4eHh4eHh4eo6Gflh4eIB4eHR4eHR4eHh4eHh4fcaOioYcel6KioWQdHRwbHB2kpKSPHB0dHB0cPaGf',
    'nJwbGxsdoqGhjRsbGxsbGxweoKGfjB0bIXCWl5eXl5iWAQFqj5KSkpOUlJOXlpaWl5eXlnIhICEhICAhISEgICKio6GXJSIi',
    'IiRKoKCfoY0iISGkoqKMICAgHx8fHx8fHx8fICOZoqGhYh9roaSjjSAfHh0fZpuio6WkpaOdIh4eHR0eHqSkoZYhIB8fHx8f',
    'Hx8eHx8fH6OjoJYfHh4eH02en6Cikh8eHh4fHh4eHh4eHh6koZ+RHh4fHh0eHh4dHR0dHR0eHhyRo6CiXx1soaKikRwcGxwb',
    'HKSkopYhHx0eHlCfoZ+kjRwbGx2joaGKGhsbGxobGx2hoZ6MHBshcJaXl5eXmJYBAVh4goOCgoOEipSUlZeXl5eWciIgISAg',
    'ICEhISEfIqKko56dnJyeoaGhoJ6gLiEhIaSioIwgHyAgIB8fHx8fHx8hLZyio6AgIDGgo6SWIR8eHx8glaKipaamn2ogHh4d',
    'HR0epKKioaGhoaKhoaKfhB4fHx8fpKOioKKko6OjoaKfoaM+Hx4eHh4eHh4eHh0dHaWhn48dHR8dHR4eHh0dHR0dHh4dLqGh',
    'oKQdHCugoqKcHhwcHBscpKSloaSkpqWlo6SioJ49GxsbHKOioYoaGxsbGxsbHaGhoIwcGyFwlpeXl5eYlgEBAQEBAQEBAQF9',
    'k5SWl5eXl5ZxIiEgICAgISEhIR8ioqSjn56foaKhoqGenDwgISEhpKGgjSAgICAgHx8fHx8fHyJtnqSijCAdIZWlpZ5XHx4d',
    'Hh9EoKKlp6aYIB4dHR0dHR6jo6KhoaGio6OlpKSGHx8fHx+ko6OgoqKjoqOhoKCiUB4fHh4eHh4eHh4eHR0dpqGfjh0dHh0d',
    'Hh0dHR0dHR0dHR5qoZ+kix0bHpqhoqFWGxwcHByjo6Sho6Ojo6Oio6KhURwbGhsdo6KiiRobGxsaGxsdoaGhjBwbIXCWmJiX',
    'l5iWAQEBAQEBAQEBAX+TlJaXl5eXl3EiISAgICAhISEhICKipKOhnp+hoaKkn486IyEgICCkoaCNICAgICAgHx8fHx8fJJii',
    'o6JoIh8gbaWloZEgHh4dHx+Uo6WooksfHh0dHR4eH6SjoqKjpKampqampIYfHx8fH6SjoqGioqOjoqGeoFIhHh8eHh4eHh4e',
    'Hh4dHR2mo6CNHR0eHR4eHh4dHR0dHR4eH5ihn6JmGxsdcqGioowcHBwcHaOioqGooaCio6KiolEcGxsaGxyjoqOKGhsbGxsb',
    'Gx2hoaGNHBshcJWYmJeXmJUBAWyUl5eWlpWVlZSVl5eXl5eWcCIhICAgICAgICAgIqKjpJp2b3BwcXA+JSAgHx8gIKWhoY0g',
    'ICAgICAgIB8fHyAtnaOhnSUgHiM5n6OjmCAeHR4eHjijpaaXHx4eHR4eHh4eoqGloG9xcXJ0dnV+SyAfHx8eo6KinnR0dXeh',
    'op+hMB4eHh4eHh4eHh4eHR0dHaajoo4eHR8dHR0eHh4eHR0dHR4hoqKfoyAcHBw6oKOjoR4bHBwcoqKhmnNuc3eiop+hMBwb',
    'GxobHKOjo4obGxsbGhsbHaGioo0cGyFwlZiYmJeYlQEBbJSXl5aWlpaWlpeXl5eXl5ZwIiEgICAgICAgICAioqOkjyEjIiEh',
    'ISIhIB8fHyAgpaGhjiAgICAgHyAgICAgIGuhoaKgcHBrcXqjoqKdUh4eHh8eIqKkpZQeHh4dHh4eHh6ioaCZHh4fHx8fIB4e',
    'Hh8fHx+ioKCUHh4eHpuin6B1Ih4eHh4eHh4eHh4dHR0dpaOhjh4dHh0dHR0eHh0dHR0dHl2joqGjdXJ3eHSgoqOlUR0cHByh',
    'oKGOHBkaHJ+kpKJtGxsbGhsco6KjixsbGxsaGxwdoaGijRwbIW+VmJiYl5iVAQFtlJaXlpaWl5eXl5eXl5eXlm8iICAgICAg',
    'ICAgICKhoqSOIB4gICAgICAgHx8fICCloaGRICAgICAfICAgICAgnqKio6Kko6KhoaCgoqCOHx4eHx4hoqSlkR0dHh4eHh4e',
    'HqKin5IeHh4eHx8dHh8eHh8fH6Ohn5EeHh4ed6OgopkeHh4eHh4eHh4dHh0dHR2ko6GQHh0dHR0dHR4eHh0dHR0fkaWjpKOl',
    'pKOko6Gjo6WFHR0cHaGgoI8cGhscdaCho5kcGhoaGxyjoqOLGxsbGxobHR2hoqKOHBshb5WYmJiXmJYBAW2Ul5eWlpeXl5eX',
    'l5eXl5eWbyIgICAgICAgICAgIqGioIwgHx8fHyAgICAgHx8gIKSioZYfHx8gIB8gICAgICSho6OkpKSko6OioaChoZMeHh8f',
    'HiCipKSQHR4eHh4fHh4eo6Odkx4dHR0dHh4eHRwfHx8fpKGgkh4eHh40n6GioEEeHh4eHh4eHh0dHh0dHaSjoJgeHR0dHR0d',
    'Hh4dHR0eHCGdpKOkpKWlpKWjoqOjpJkcHhwcoKGhkBwaGxs0pKOipj4aGhoaHKOioo4aGxsbGxweHaChoo0cHCFvlJiYmJiZ',
    'lgEBcZeUlpaXl5eXl5eXl5iXl5ZuIiAgICAgICAgICAhoaKgix8eHh8fHyAgHx8fHx8goqKgmB4fHx8fHx8gISAgYqSjpKWj',
    'oqCgn6Cjo6Kho1sgHyAfIqGkpJAeHh8eHh4eHh6jo6CVHR0eHh4eHh4fHh8fHx+koaCUHx4fHx+KoqOliB4eHh4eHh4eHh4d',
    'HR0dnqChnR0cGh0bHRscj6Chlh0dWqino6SlpaSjoqOioaOjpE0eHB2hoKGSGxkaGx6HpaKkhhkZGxoco6KjjBsaGhscHR05',
    'oaKjjhwcIW+UmZmZmJeWAQJwkpaWl5eXl5eXmJiYmJeXlW0iICAgICAgICAgICGgoaCLHx4eHx8gICAfHx8eHx+hoaGbIB8f',
    'Hx4fIB8hISGUo6SiWyEhISEhISNwo6KlhyAfHyAioaSjkB8dHx8eHh4eH6SkoZgeHh4eHh4fHh4eHx8fH6ShoZUeHh4fH2Sh',
    'pKWbIR4eHh4eHh4eHh0dHR2hpaGiZR0cHRwcHGacn52aHx+bpaOjViAdHR0dHSJsoaSheB4cHaGgoZIbGhobHGehoqSTGxsa',
    'Ghyjo6OUGxsbGxwdHpqioqNqGxwhb5OYmJiYlpIDAnCSlpaWlpaWlpeXl5eXlpeVbCIgICAgICAgIB8fIZ+gnooeHR8fHx8g',
    'IB8fHx4fH6ChoZ57dnRzcnJyc20kJZ+jo6AiISEhISAhIDifn6ShIB8gHyGhpaSQHh4fHx4eHh4fpaainXZ0cnR1dXZ1dlQf',
    'Hx8fpKKhlR4eHh8eIJ+kpKJKHx4eHh4eHh4eHR0eHW2goqWhg3p5d3iDnaKgm3gcIKCjpaMgHR0dHBwcHC2moqOhHhwdoaCg',
    'kxsaGxscHKGipKBJGxocHKOjo6FzcXBxc3uWpKKimycbGyFvk5iYmJeWlpiUlpeWlpaXl5eXl5eXl5eWlpRsIiAgICAgICAg',
    'Hx8hnqCeiR8dHx8fHyAgHx8fHx8fnqGhoaGio6OjoqKgoCRioqKgnCEgICAgICAgI52koaJBHyAeIaGkpZAfHh8fHx4fHh+k',
    'p6KioqKhpKWlpKGjgx8fHx+lo6GVHh8fHx0fjaGkpZAfHh4eHh4eHh4dHh4dIX6joqOipKGkoqOhpKCUHh5bnaKmlRwcGxsb',
    'HBscHZ2jo6JBHB6hoJ+UGxobGxsciKGmpYEcGhkcoqOkoqGgo6GgoJ+fpZpSGxsbI2+SmJiXl5WVlZSVlZaWl5eXl5eXl5eX',
    'l5aXk24hISAgICAfIB8fHyGepJ6KIB4eHx8gHx8fHx4eHh+dn6ChoqOkpaSko6OhI4min6FnIiAgICAfIB8hj6Okpn4fICAh',
    'oKWkjyEgHx8fHx4eHqeqpKOjpKSkpKSkpKODHx8fH6WkopIeHh4eHh5FoaaloiEeHh4eHR0dHR0dHR0cHnuopqampqWkpKOl',
    'lxsdII6kpqRsHh0cHBwcGxwdeaKloIMcHaCinpIbGhscHBs9o6enkh8aGhyjpKSkpKSko6OioZ+ZUhsaGhshcJCYmJeXlZWU',
    'lZWVlZaWl5eXl5eXl5aWlZaQaR8hHx8fIB8fHx8fIJuenYQfHh4fHx8fHx8eHh4eHpudnZ+goqKjoqCfn6EjmaWloSYhICAg',
    'ICAgHyBMoKKkih8gHyGhp6ONHx8fHx8eHh4fo6iio6SlpaSko6OjoIMfHx8fpqOhkh4eHx8eHh6YoqWjVB4eHR0eHR0dHR0d',
    'Hh0dIGyioqKioqKhoWweHB0elaWqpiQcHBwcHBwbHBxInqSimxwdnZ6cjRsbGxwbHB6SpKWgThobHJ6ipKWlpKOjoqGgjUMc',
    'GxobGyNskJiYl5eVlJWVlJWVlpaXlpaWlpaWlpaVlpBrISIfHx8gHx8fHx8fICEgIB0eHR8fHx8fHx4eHh4eHx8fICAgICAg',
    'IB8fHx8fICAgIB8gHx8gHyAgICEiISEgHx8fHx4gHx8gHx8fHx8fHx8gIB8gHx8fHx8fHx8fHh8fHx4eHh4cHx8fHx4eHh4e',
    'HR0dHh4eHh4dHR0eHh4eHRwcHh0dHR0eHR0cHRsaHBwcHB0dHRwcHBwbHBscHBwcGxsbGxwcHBscGxsbGxwcGxwbGxobGhsb',
    'GxsbGxsbGxsaGhsaHBsbGhobIRt3lpaWlpWUlZWVlZWWlpWVlZWVlZWWlpWVkCEgIB8fHyAgHx8fHx8gHx8eHh4eHx8fHx8e',
    'Hh4eHh4eHh4fHx8fHh0dHh4eHyEfHyAgHx8gICAfICEhISAhICEgICAgIB8gICAfHx8fHx8fHx8fHx8fHx8fHx8eHh4fHx4e',
    'Hx4fHh4fHx8eHh4eHh4eHh4eHh4eHh4eHh4dHh4dHRwcGxsbGxsbGxwcHBscHBwcHB0cHBwcHBwcHBwcHBsbGxsbGxwcGxob',
    'GxsbGxwbHBsbGhobGxsbGxsbGxsbGxsbGxsbGxsbGhoiIR45Ojo7Ozw8PDw7Ozs7Ojo6Ojk5OTk5OTkfHx8gHx8fICAfHx8f',
    'Hx8fIB8fHx8fHx8eHh4eHh4eHh4eHh4fHh4eHh4eHh4fHh8fHx8gHx8gIB8gICAgISEhICAgICAgICAgIB8fHx8fIB8gHyAg',
    'HyAfIB8fICAgICAfHx8fHx8fHx8fHx8eHh4eHh4eHh4eHh4eHh4eHh4eHx4dHR4dHBwdHRwcHB0bGxwcHBwcHBwcHBwcHBwb',
    'GxsbGxsbGxwcHBwbGxobGxsbGxsbGxsbGhobGxsbGxsbGxobGxsbGxsbGxsaGiIiIiIiIyMjIyMjIiIiIiIiISEhISEhISAg',
    'Hx8eHx8fHx8fHx8fHx8fHx8fHx8eHx4fHx4eHh4eHR0dHh4eHh4eHh4eHh4eHh4fHx8fHx8fHx8fHx8fICEhISAgICAgHyAg',
    'ICAgIB8fHx8fHyAgICAgICAgICAgICAgIB8fHx8fHx8gHx8fHx4eHh8eHh4fHh4eHh4eHh4eHh4eHh0dHR0dHR0dHR0dHRwc',
    'HBwcHBwcHBwcHBwbGxsbGxsbGxsbHBwbHBwbGhsbGxsbGxsbGxsaGhsbGxscGxsbGxsaGhoaGxsbGxoa',
]);
