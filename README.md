# Swim3D

[Swim3D](https://rene78.github.io/Swim3D/) is an interactive 3D visualization of a freestyle swimming stroke.

It is designed for:
- swimmers who want to better understand technique
- coaches and educators
- 3D artists and developers interested in motion and biomechanics

The project breaks down the freestyle stroke cycle into a clean, easy-to-study 3D experience.

![Picture of App][screenshot]

[screenshot]: img/multi-devices.png "Picture of the App"

---

## Features

- Interactive 3D swimmer animation
- Realistic freestyle stroke cycle
- Clean visualization for analysis and learning
- Runs directly in the browser
- Can be used offline ('Add to Home Screen' in mobile browser, 'Install' button on desktop browsers. See [screenshot] (https://github.com/rene78/Swim3D/blob/main/img/pwa.webp))

---

## Project Goals

- Make swimming technique easier to understand visually
- Provide high-quality reference animations
- Build an open library of swimming movements
- Enable reuse in education, animation, and research

---

## Roadmap

Planned improvements include:

- Additional swimming styles:
  - Breaststroke
  - Backstroke
  - Butterfly
- Flip turns
- Underwater phases
- Stroke breakdown (catch, pull, recovery, kick timing)
- UI improvements and annotations

---

## Contributing

Contributions are very welcome — especially from people with experience in **Blender**.

### What we’re looking for

We are actively looking for help creating new swimming animations:

- Breaststroke
- Backstroke
- Butterfly
- Flip turns
- Starts and underwater phases

If you enjoy character animation or biomechanics, this is a great project to contribute to.
[Swimmer in Blender](https://github.com/user-attachments/assets/dceabf87-5430-4cc2-a3a5-e59d4d5ed238)

---

### How to contribute

1. Fork the repository  
2. Create a new animation in Blender (within ```Swimmer.blend```)
3. Export the animation (GLTF/GLB preferred)
4. Open a pull request with:
   - the updated ```Swimmer.blend``` file
   - a short description
   - optionally a preview (GIF/video)

---

### Animation guide (coming soon)

I am currently creating a step-by-step YouTube tutorial explaining:

- how to rig a swimmer
- how to animate realistic strokes
- how to export for this project

This will be linked here once available.

---

### Guidelines

- Keep animations **loopable** where possible
- Aim for **realistic timing and biomechanics**
- Use reference videos of a professional swimmer, if possible

---

## Tech Stack

- Vanilla JS
- Three.js
- Blender for animation creation
- GLTF/GLB for animations

---

## Inspiration / References

The creator of this repo couldn't find high quality 3D animations of professional swimmers online so decided to do them on his own.

---

## License

GNU Lesser General Public License

---

## Acknowledgements

- Freestyle animation: Dan Smith and the video [Is This The Easiest 1:10/100m Freestyle Ever?](https://www.youtube.com/watch?v=b-aG10Hv-NM) - by **Effortless Swimming**.