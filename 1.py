# Beginner-friendly grade average calculator

grade1 = float(input("Enter grade 1: "))
grade2 = float(input("Enter grade 2: "))
grade3 = float(input("Enter grade 3: "))

average = (grade1 + grade2 + grade3) / 3
print("Average grade:", average)

if average > 90:
    print("Excellent")
elif average > 75:
    print("Good")
elif average > 60:
    print("Pass")
elif average >= 40:
    print("Fail")
else:
    print("Fail")
