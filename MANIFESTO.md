# Pragmatic Programming in the AI Age

The goal of software development is to generate value.
The goal of effective software developers is to generate a high rate of value per unit time.

    rate = value / time

We can improve the rate by either increasing value or decreasing time.
All subsequent approaches, principles and techniques are ultimately motivated by improving one of those.
 - ▲value
 - ▼time

# Approaches

There are three broad approaches to achieving these goals.

- Quality: Write better applications. ▲value
- Quantity: Write more applications. ▲value
- Velocity: Write applications faster. ▼time

## External vs Internal Quality

The external quality of software applications is something consumers can measure and assess.

- Correct: Are all features without errors?
- Complete: Are all required features present?
- Beautiful: Is the application enjoyable to use?
- Secure: Does the application protect sensitive user data? (Generally only assessed if it fails.)

The internal quality of a software application is something only engineers can measure and assess directly.
Non-engineers can usually only assess internal quality of code by observing external quality or velocity.
Internal quality is generally not a goal on it's own but is used to increase external quality or velocity.

## Code

### Relative cost of common developer code interactions

A function on a large team of developers is written, edited, called and read for comprehension at significantly different rates.

| Operation              | Count | Time/op | Total Time | Notes                                               |
| ---------------------- | ----: | ------: | ---------: | --------------------------------------------------- |
| Write                  |     1 |      10 |         10 | Time decreasing with AI agents                      |
| Edit                   |     5 |      10 |         50 | Time scales exponentially with size > 100 lines     |
| Read implementation    |    20 |       5 |        100 | Time scales exponentially with size > 100 lines     |
| Read interface         |  1000 |       1 |       1000 | Time proportional to complexity                     |

This difference implies that we should prioritize in order:
- comprehension of interface
- comprehension of implementation
- ease of editing
- ease of writing

Any improvement to these represents a decrease in total time required and an increase in total velocity. That must be balanced against how much effort the improvement costs compared to the later expected gains.

Both humans and ai agents have similar relative difficulty reading and comprehending complex logic so these ratios remain even with adoption of ai. The increase in ai usage for implementing and editing implies that even more effort should go into interfaces. As ai capabilities increase, they may take over increasingly significant interfaces with humans oversite elevating to the higher level interfaces. The principles of good interface design are largely the same at both the low and high levels, so investment of human time in learning (and teaching ai) better interface design is well invested.

### Measures of Code Quality

- Comprehensibility: ▲Velocity
- Reusability: ▲Velocity
- Testability: ▲Velocity

### Principles

- Clear:         ▲Comprehensibility
- Concise:       ▲Comprehensibility
- High Cohesion: ▲Comprehensibility, ▲Reusability
- Low Coupling:  ▲Reusability, ▲Testability

